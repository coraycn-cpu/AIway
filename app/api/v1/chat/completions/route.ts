import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/auth";
import { runGatewayModel } from "@/lib/ai";
import { assertCanSpend, calcCost, chargeAccount } from "@/lib/billing";
import { getSql } from "@/lib/db";
import { getModeSettings, ModeForbiddenError } from "@/lib/settings";
import { handleApiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

type ChatMessage = {
  role?: string;
  content?: unknown;
};

function openaiError(status: number, message: string, code?: string) {
  return NextResponse.json(
    {
      error: {
        message,
        type: status === 401 ? "invalid_request_error" : "api_error",
        code: code || String(status),
      },
    },
    { status },
  );
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && typeof p.text === "string") return p.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function imageUrlsFromContent(content: unknown): string[] {
  const urls: string[] = [];
  if (!Array.isArray(content)) return urls;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as {
      type?: string;
      image_url?: string | { url?: string };
      url?: string;
    };
    if (p.type !== "image_url" && p.type !== "image") continue;
    const raw =
      typeof p.image_url === "string"
        ? p.image_url
        : p.image_url?.url || p.url || "";
    if (typeof raw === "string" && /^https?:\/\//i.test(raw)) urls.push(raw);
  }
  return [...new Set(urls)].slice(0, 6);
}

function parseMessages(messages: ChatMessage[]) {
  const systems: string[] = [];
  const userTexts: string[] = [];
  const imageUrls: string[] = [];

  for (const msg of messages) {
    const role = (msg.role || "user").toLowerCase();
    const text = textFromContent(msg.content).trim();
    imageUrls.push(...imageUrlsFromContent(msg.content));
    if (role === "system" && text) systems.push(text);
    else if (text) userTexts.push(text);
  }

  return {
    system: systems.join("\n"),
    prompt: userTexts.join("\n") || "Please analyze the attached image(s).",
    image_urls: [...new Set(imageUrls)].slice(0, 6),
  };
}

async function resolveCatalogModel(requested: string) {
  const sql = getSql();
  const id = requested.trim();
  const rows = await sql<
    {
      model_id: string;
      input_price_per_1m: string;
      output_price_per_1m: string;
      enabled: boolean;
    }[]
  >`
    SELECT model_id, input_price_per_1m::text, output_price_per_1m::text, enabled
    FROM model_catalog
    WHERE enabled = TRUE
      AND (
        model_id = ${id}
        OR model_id = ${"google/" + id}
        OR model_id = ${"openai/" + id}
        OR model_id = ${"deepseek/" + id}
        OR model_id = ${"anthropic/" + id}
        OR split_part(model_id, '/', 2) = ${id}
      )
    ORDER BY
      CASE
        WHEN model_id = ${id} THEN 0
        WHEN model_id = ${"google/" + id} THEN 1
        ELSE 2
      END
    LIMIT 1
  `;
  return rows[0] || null;
}

/**
 * OpenAI-compatible chat completions, billed as AIway raw mode.
 * Used by business-site "OpenAI 兼容视觉接口" forms that POST to
 * {base}/chat/completions.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    const modes = await getModeSettings();
    if (!modes.raw_mode_enabled) {
      throw new ModeForbiddenError("Raw mode is disabled by admin (global switch)");
    }
    if (!auth.site.raw_enabled) {
      throw new ModeForbiddenError(
        "Raw mode is disabled for this site. Ask admin to enable site.raw_enabled.",
      );
    }

    const json = (await req.json().catch(() => null)) as {
      model?: string;
      messages?: ChatMessage[];
      temperature?: number;
      max_tokens?: number;
    } | null;

    const modelName = String(json?.model || "").trim();
    const messages = Array.isArray(json?.messages) ? json.messages : [];
    if (!modelName) {
      return openaiError(400, "Missing model. Use a catalog id such as google/gemini-2.0-flash.");
    }
    if (messages.length === 0) {
      return openaiError(400, "Missing messages[]");
    }

    const parsed = parseMessages(messages);
    const model = await resolveCatalogModel(modelName);
    if (!model) {
      return openaiError(
        404,
        `Model not found or disabled in AIway catalog: ${modelName}. Try google/gemini-2.0-flash`,
        "model_not_found",
      );
    }

    await assertCanSpend(auth.account.id);

    const sql = getSql();
    let outputText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    try {
      const result = await runGatewayModel({
        modelId: model.model_id,
        system: parsed.system,
        prompt: parsed.prompt,
        temperature:
          typeof json?.temperature === "number" ? json.temperature : 0.7,
        maxTokens:
          typeof json?.max_tokens === "number" && json.max_tokens > 0
            ? Math.min(json.max_tokens, 16000)
            : 2048,
        input: { image_urls: parsed.image_urls },
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
          error_code, error_message, latency_ms
        ) VALUES (
          ${requestId}, ${auth.site.id}, ${auth.account.id}, 'raw',
          ${model.model_id}, 0, 0, 0, 0, 'error', '502', ${message},
          ${Date.now() - started}
        )
      `;
      return openaiError(502, "Upstream model failed", "502");
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
        input_tokens, output_tokens, total_tokens, cost, status, latency_ms
      ) VALUES (
        ${requestId}, ${auth.site.id}, ${auth.account.id}, 'raw',
        ${model.model_id}, ${inputTokens}, ${outputTokens}, ${totalTokens},
        ${cost}, 'success', ${Date.now() - started}
      )
      RETURNING id
    `;

    try {
      await chargeAccount({
        accountId: auth.account.id,
        siteId: auth.site.id,
        amount: cost,
        usageLogId: logRows[0].id,
        note: `openai-compat:${model.model_id}`,
      });
    } catch (err) {
      await sql`
        UPDATE usage_logs
        SET status = 'rejected', error_code = '402', error_message = 'Insufficient balance after call'
        WHERE id = ${logRows[0].id}
      `;
      throw err;
    }

    return NextResponse.json({
      id: `chatcmpl-${requestId}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model.model_id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: outputText },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: totalTokens,
      },
      request_id: requestId,
    });
  } catch (err) {
    if (err instanceof ModeForbiddenError) {
      return openaiError(err.status, err.message, err.code);
    }
    const mapped = handleApiError(err);
    const body = await mapped.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error?: { message?: string } }).error?.message || mapped.statusText)
        : mapped.statusText;
    return openaiError(mapped.status, message || "Request failed");
  }
}
