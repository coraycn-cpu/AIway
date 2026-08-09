import { randomUUID } from "crypto";
import { z } from "zod";
import { authenticateBearer } from "@/lib/auth";
import { runGatewayModel } from "@/lib/ai";
import { assertCanSpend, calcCost, chargeAccount } from "@/lib/billing";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import {
  assertInputMatchesTaskSchema,
  loadTaskAndPrompt,
  renderTemplate,
} from "@/lib/prompts";
import { parseModelJson } from "@/lib/api/parseModelJson";
import { getModeSettings, ModeForbiddenError } from "@/lib/settings";

export const dynamic = "force-dynamic";

const taskBodySchema = z.object({
  mode: z.literal("task").optional(),
  task: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  trace_id: z.string().optional(),
});

const rawBodySchema = z.object({
  mode: z.literal("raw"),
  model_id: z.string().min(1),
  system: z.string().optional().default(""),
  prompt: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(16000).optional(),
  image_urls: z.array(z.string().url()).max(6).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  trace_id: z.string().optional(),
});

export async function POST(req: Request) {
  const started = Date.now();
  const requestId = randomUUID();
  let siteId: string | undefined;
  let accountId: string | undefined;
  let taskCode: string | undefined;
  let traceId: string | undefined;
  let runMode: "task" | "raw" = "task";

  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    siteId = auth.site.id;
    accountId = auth.account.id;

    const json = await req.json().catch(() => null);
    const modeSettings = await getModeSettings();

    const isRaw =
      json &&
      typeof json === "object" &&
      (json as { mode?: string }).mode === "raw";

    if (isRaw) {
      runMode = "raw";
      taskCode = "raw";
      if (!modeSettings.raw_mode_enabled) {
        throw new ModeForbiddenError("Raw mode is disabled by admin (global switch)");
      }
      if (!auth.site.raw_enabled) {
        throw new ModeForbiddenError(
          "Raw mode is disabled for this site. Ask admin to enable site.raw_enabled.",
        );
      }

      const parsed = rawBodySchema.safeParse(json);
      if (!parsed.success) return jsonError(400, "400", "Invalid raw request body");
      traceId = parsed.data.trace_id;

      await assertCanSpend(auth.account.id);

      const sql = getSql();
      const models = await sql<
        { model_id: string; input_price_per_1m: string; output_price_per_1m: string; enabled: boolean }[]
      >`
        SELECT model_id, input_price_per_1m::text, output_price_per_1m::text, enabled
        FROM model_catalog
        WHERE model_id = ${parsed.data.model_id}
        LIMIT 1
      `;
      const model = models[0];
      if (!model || !model.enabled) {
        return jsonError(404, "404", "Model not found or disabled in catalog");
      }

      const imageInput: Record<string, unknown> = {
        ...(parsed.data.input || {}),
      };
      if (parsed.data.image_urls?.length) {
        imageInput.image_urls = parsed.data.image_urls;
      }

      let outputText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;

      try {
        const result = await runGatewayModel({
          modelId: parsed.data.model_id,
          system: parsed.data.system || "",
          prompt: parsed.data.prompt,
          temperature: parsed.data.temperature ?? 0.7,
          maxTokens: parsed.data.max_tokens ?? 2048,
          input: imageInput,
        });
        outputText = result.text;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        totalTokens = result.totalTokens || inputTokens + outputTokens;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upstream model failed";
        await sql`
          INSERT INTO usage_logs (
            request_id, site_id, account_id, task_code, model_id,
            input_tokens, output_tokens, total_tokens, cost, status,
            error_code, error_message, trace_id, latency_ms
          ) VALUES (
            ${requestId}, ${auth.site.id}, ${auth.account.id}, 'raw',
            ${parsed.data.model_id}, 0, 0, 0, 0, 'error', '502', ${message},
            ${traceId ?? null}, ${Date.now() - started}
          )
        `;
        return jsonError(502, "502", "Upstream model failed", { request_id: requestId });
      }

      const cost = calcCost(
        inputTokens,
        outputTokens,
        Number(model.input_price_per_1m),
        Number(model.output_price_per_1m),
      );

      const logRows = await sql<{ id: string }[]>`
        INSERT INTO usage_logs (
          request_id, site_id, account_id, task_code, model_id,
          input_tokens, output_tokens, total_tokens, cost, status,
          trace_id, latency_ms
        ) VALUES (
          ${requestId}, ${auth.site.id}, ${auth.account.id}, 'raw',
          ${parsed.data.model_id}, ${inputTokens}, ${outputTokens}, ${totalTokens},
          ${cost}, 'success', ${traceId ?? null}, ${Date.now() - started}
        )
        RETURNING id
      `;

      try {
        await chargeAccount({
          accountId: auth.account.id,
          siteId: auth.site.id,
          amount: cost,
          usageLogId: logRows[0].id,
          note: `raw:${parsed.data.model_id}`,
        });
      } catch (err) {
        await sql`
          UPDATE usage_logs
          SET status = 'rejected', error_code = '402', error_message = 'Insufficient balance after call'
          WHERE id = ${logRows[0].id}
        `;
        throw err;
      }

      const balanceRows = await sql<{ balance: string }[]>`
        SELECT balance::text FROM accounts WHERE id = ${auth.account.id}
      `;
      const jsonParsed = parseModelJson(outputText);

      return jsonOk({
        request_id: requestId,
        mode: "raw",
        output_text: jsonParsed.ok ? jsonParsed.jsonText : outputText,
        output_json: jsonParsed.ok ? jsonParsed.value : null,
        output_format: jsonParsed.ok ? "json" : "text",
        prompt_scope: "raw",
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          cost,
          model_id: parsed.data.model_id,
        },
        balance: Number(balanceRows[0]?.balance ?? 0),
      });
    }

    // ---- task mode ----
    if (!modeSettings.task_mode_enabled) {
      throw new ModeForbiddenError("Task mode is disabled by admin (global switch)");
    }

    const parsed = taskBodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError(
        400,
        "400",
        "Invalid request body. Use task mode {task,input} or raw mode {mode:'raw',model_id,prompt}",
      );
    }
    taskCode = parsed.data.task;
    traceId = parsed.data.trace_id;
    runMode = "task";

    await assertCanSpend(auth.account.id);

    const { task, prompt, schema, scope } = await loadTaskAndPrompt(
      parsed.data.task,
      auth.site.id,
    );
    assertInputMatchesTaskSchema(schema, parsed.data.input);
    const system = renderTemplate(prompt.system_template, parsed.data.input);
    const userPrompt = renderTemplate(prompt.user_template, parsed.data.input);

    const sql = getSql();
    const models = await sql<
      { model_id: string; input_price_per_1m: string; output_price_per_1m: string; enabled: boolean }[]
    >`
      SELECT model_id, input_price_per_1m::text, output_price_per_1m::text, enabled
      FROM model_catalog
      WHERE model_id = ${task.default_model_id}
      LIMIT 1
    `;
    const model = models[0];
    if (!model || !model.enabled) {
      return jsonError(404, "404", "Model not found or disabled");
    }

    let outputText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    try {
      const result = await runGatewayModel({
        modelId: task.default_model_id,
        system,
        prompt: userPrompt,
        temperature: Number(task.temperature),
        maxTokens: task.max_tokens,
        input: parsed.data.input,
      });
      outputText = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      totalTokens = result.totalTokens || inputTokens + outputTokens;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upstream model failed";
      await sql`
        INSERT INTO usage_logs (
          request_id, site_id, account_id, task_id, task_code, model_id,
          input_tokens, output_tokens, total_tokens, cost, status,
          error_code, error_message, trace_id, latency_ms
        ) VALUES (
          ${requestId}, ${auth.site.id}, ${auth.account.id}, ${task.id}, ${task.task_code},
          ${task.default_model_id}, 0, 0, 0, 0, 'error', '502', ${message},
          ${traceId ?? null}, ${Date.now() - started}
        )
      `;
      return jsonError(502, "502", "Upstream model failed", { request_id: requestId });
    }

    const cost = calcCost(
      inputTokens,
      outputTokens,
      Number(model.input_price_per_1m),
      Number(model.output_price_per_1m),
    );

    const logRows = await sql<{ id: string }[]>`
      INSERT INTO usage_logs (
        request_id, site_id, account_id, task_id, task_code, model_id,
        input_tokens, output_tokens, total_tokens, cost, status,
        trace_id, latency_ms
      ) VALUES (
        ${requestId}, ${auth.site.id}, ${auth.account.id}, ${task.id}, ${task.task_code},
        ${task.default_model_id}, ${inputTokens}, ${outputTokens}, ${totalTokens},
        ${cost}, 'success', ${traceId ?? null}, ${Date.now() - started}
      )
      RETURNING id
    `;

    try {
      await chargeAccount({
        accountId: auth.account.id,
        siteId: auth.site.id,
        amount: cost,
        usageLogId: logRows[0].id,
        note: `task:${task.task_code}`,
      });
    } catch (err) {
      await sql`
        UPDATE usage_logs
        SET status = 'rejected', error_code = '402', error_message = 'Insufficient balance after call'
        WHERE id = ${logRows[0].id}
      `;
      throw err;
    }

    const balanceRows = await sql<{ balance: string }[]>`
      SELECT balance::text FROM accounts WHERE id = ${auth.account.id}
    `;
    const jsonParsed = parseModelJson(outputText);

    return jsonOk({
      request_id: requestId,
      mode: "task",
      output_text: jsonParsed.ok ? jsonParsed.jsonText : outputText,
      output_json: jsonParsed.ok ? jsonParsed.value : null,
      output_format: jsonParsed.ok ? "json" : "text",
      prompt_scope: scope,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost,
        model_id: task.default_model_id,
      },
      balance: Number(balanceRows[0]?.balance ?? 0),
    });
  } catch (err) {
    if (siteId && accountId) {
      try {
        const sql = getSql();
        await sql`
          INSERT INTO usage_logs (
            request_id, site_id, account_id, task_code, cost, status,
            error_code, error_message, trace_id, latency_ms
          ) VALUES (
            ${requestId}, ${siteId}, ${accountId}, ${taskCode ?? runMode}, 0, 'rejected',
            ${err instanceof Error && "status" in err ? String((err as { status: number }).status) : "500"},
            ${err instanceof Error ? err.message : "error"},
            ${traceId ?? null}, ${Date.now() - started}
          )
          ON CONFLICT (request_id) DO NOTHING
        `;
      } catch {
        // ignore secondary log failures
      }
    }
    return handleApiError(err);
  }
}
