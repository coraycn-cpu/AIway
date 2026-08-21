import { randomUUID } from "crypto";
import { z } from "zod";
import { authenticateBearer } from "@/lib/auth";
import { runGatewayModel, formatUpstreamError } from "@/lib/ai";
import {
  calcCost,
  chargeAccount,
  estimateHoldCost,
  releaseHold,
  reserveHold,
} from "@/lib/billing";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import {
  assertInputMatchesTaskSchema,
  loadTaskAndPrompt,
  renderTemplate,
} from "@/lib/prompts";
import { parseModelJson } from "@/lib/api/parseModelJson";
import { getModeSettings, ModeForbiddenError } from "@/lib/settings";
import { assertRateLimit } from "@/lib/rate-limit";
import { resolveCatalogModel } from "@/lib/catalog";
import {
  findIdempotentResponse,
  readIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/idempotency";
import { isUnsafeImageUrlError } from "@/lib/net/safe-url";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  image_urls: z
    .array(
      z.string().refine(
        (s) => /^https?:\/\//i.test(s) || /^data:image\//i.test(s),
        "image must be an https URL or data:image URI",
      ),
    )
    .max(6)
    .optional(),
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
  let holdAmount = 0;

  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    siteId = auth.site.id;
    accountId = auth.account.id;

    const modeSettings = await getModeSettings();
    assertRateLimit(auth.site.id, modeSettings.rate_limit_per_minute);

    const idemKey = readIdempotencyKey(req);
    if (idemKey) {
      const hit = await findIdempotentResponse(auth.site.id, idemKey);
      if (hit) {
        return jsonOk(hit.response_body, {
          headers: {
            "Idempotent-Replay": "true",
            "X-Request-Id": hit.request_id,
          },
        });
      }
    }

    const json = await req.json().catch(() => null);

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

      const model = await resolveCatalogModel(parsed.data.model_id);
      if (!model || !model.enabled) {
        return jsonError(404, "404", "Model not found or disabled in catalog");
      }

      const imageInput: Record<string, unknown> = {
        ...(parsed.data.input || {}),
      };
      if (parsed.data.image_urls?.length) {
        imageInput.image_urls = parsed.data.image_urls;
      }

      holdAmount = estimateHoldCost({
        inputPricePer1m: Number(model.input_price_per_1m),
        outputPricePer1m: Number(model.output_price_per_1m),
        maxTokens: parsed.data.max_tokens ?? 2048,
        imageCount: parsed.data.image_urls?.length || 0,
        minCostPerCall: Number(model.min_cost_per_call || 0),
      });
      await reserveHold({
        accountId: auth.account.id,
        amount: holdAmount,
        requestId,
      });

      const sql = getSql();
      let outputText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;

      try {
        const result = await runGatewayModel({
          modelId: model.model_id,
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
        console.error("raw run upstream error", requestId, err);
        const message = formatUpstreamError(err);
        await releaseHold({ accountId: auth.account.id, amount: holdAmount });
        holdAmount = 0;
        if (isUnsafeImageUrlError(err)) {
          return jsonError(400, "400", message, { request_id: requestId });
        }
        await sql`
          INSERT INTO usage_logs (
            request_id, site_id, account_id, task_code, model_id,
            input_tokens, output_tokens, total_tokens, cost, status,
            error_code, error_message, trace_id, latency_ms
          ) VALUES (
            ${requestId}, ${auth.site.id}, ${auth.account.id}, 'raw',
            ${model.model_id}, 0, 0, 0, 0, 'error', '502', ${message},
            ${traceId ?? null}, ${Date.now() - started}
          )
        `;
        return jsonError(502, "502", `Upstream model failed: ${message}`, {
          request_id: requestId,
        });
      }

      let cost = calcCost(
        inputTokens,
        outputTokens,
        Number(model.input_price_per_1m),
        Number(model.output_price_per_1m),
      );
      cost = Math.max(cost, Number(model.min_cost_per_call || 0));

      const logRows = await sql<{ id: string }[]>`
        INSERT INTO usage_logs (
          request_id, site_id, account_id, task_code, model_id,
          input_tokens, output_tokens, total_tokens, cost, status,
          trace_id, latency_ms
        ) VALUES (
          ${requestId}, ${auth.site.id}, ${auth.account.id}, 'raw',
          ${model.model_id}, ${inputTokens}, ${outputTokens}, ${totalTokens},
          ${cost}, 'success', ${traceId ?? null}, ${Date.now() - started}
        )
        RETURNING id
      `;

      let balance = 0;
      try {
        const charged = await chargeAccount({
          accountId: auth.account.id,
          siteId: auth.site.id,
          amount: cost,
          usageLogId: logRows[0].id,
          note: `raw:${model.model_id}`,
          holdAmount,
        });
        holdAmount = 0;
        balance = charged.balance;
      } catch (err) {
        await releaseHold({ accountId: auth.account.id, amount: holdAmount });
        holdAmount = 0;
        await sql`
          UPDATE usage_logs
          SET status = 'rejected', error_code = '402', error_message = 'Insufficient balance after call'
          WHERE id = ${logRows[0].id}
        `;
        throw err;
      }

      const jsonParsed = parseModelJson(outputText);
      const body = {
        request_id: requestId,
        mode: "raw" as const,
        output_text: jsonParsed.ok ? jsonParsed.jsonText : outputText,
        output_json: jsonParsed.ok ? jsonParsed.value : null,
        output_format: jsonParsed.ok ? ("json" as const) : ("text" as const),
        prompt_scope: "raw" as const,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          cost,
          model_id: model.model_id,
        },
        balance,
      };
      if (idemKey) {
        await saveIdempotentResponse({
          siteId: auth.site.id,
          idemKey,
          requestId,
          responseStatus: 200,
          responseBody: body,
        });
      }
      return jsonOk(body);
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

    const { task, prompt, schema, scope } = await loadTaskAndPrompt(
      parsed.data.task,
      auth.site.id,
    );
    assertInputMatchesTaskSchema(schema, parsed.data.input);
    const system = renderTemplate(prompt.system_template, parsed.data.input);
    const userPrompt = renderTemplate(prompt.user_template, parsed.data.input);

    const model = await resolveCatalogModel(task.default_model_id);
    if (!model || !model.enabled) {
      return jsonError(404, "404", "Model not found or disabled");
    }

    holdAmount = estimateHoldCost({
      inputPricePer1m: Number(model.input_price_per_1m),
      outputPricePer1m: Number(model.output_price_per_1m),
      maxTokens: task.max_tokens,
      imageCount: Array.isArray(parsed.data.input.image_urls)
        ? parsed.data.input.image_urls.length
        : parsed.data.input.image_url
          ? 1
          : 0,
      minCostPerCall: Number(model.min_cost_per_call || 0),
    });
    await reserveHold({
      accountId: auth.account.id,
      amount: holdAmount,
      requestId,
    });

    const sql = getSql();
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
      console.error("task run upstream error", requestId, err);
      const message = formatUpstreamError(err);
      await releaseHold({ accountId: auth.account.id, amount: holdAmount });
      holdAmount = 0;
      if (isUnsafeImageUrlError(err)) {
        return jsonError(400, "400", message, { request_id: requestId });
      }
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
      return jsonError(502, "502", `Upstream model failed: ${message}`, {
        request_id: requestId,
      });
    }

    let cost = calcCost(
      inputTokens,
      outputTokens,
      Number(model.input_price_per_1m),
      Number(model.output_price_per_1m),
    );
    cost = Math.max(cost, Number(model.min_cost_per_call || 0));

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

    let balance = 0;
    try {
      const charged = await chargeAccount({
        accountId: auth.account.id,
        siteId: auth.site.id,
        amount: cost,
        usageLogId: logRows[0].id,
        note: `task:${task.task_code}`,
        holdAmount,
      });
      holdAmount = 0;
      balance = charged.balance;
    } catch (err) {
      await releaseHold({ accountId: auth.account.id, amount: holdAmount });
      holdAmount = 0;
      await sql`
        UPDATE usage_logs
        SET status = 'rejected', error_code = '402', error_message = 'Insufficient balance after call'
        WHERE id = ${logRows[0].id}
      `;
      throw err;
    }

    const jsonParsed = parseModelJson(outputText);
    const body = {
      request_id: requestId,
      mode: "task" as const,
      output_text: jsonParsed.ok ? jsonParsed.jsonText : outputText,
      output_json: jsonParsed.ok ? jsonParsed.value : null,
      output_format: jsonParsed.ok ? ("json" as const) : ("text" as const),
      prompt_scope: scope,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost,
        model_id: task.default_model_id,
      },
      balance,
    };
    if (idemKey) {
      await saveIdempotentResponse({
        siteId: auth.site.id,
        idemKey,
        requestId,
        responseStatus: 200,
        responseBody: body,
      });
    }
    return jsonOk(body);
  } catch (err) {
    if (holdAmount > 0 && accountId) {
      await releaseHold({ accountId, amount: holdAmount }).catch(() => undefined);
    }
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
