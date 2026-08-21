import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
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
import { getModeSettings, ModeForbiddenError } from "@/lib/settings";
import { handleApiError } from "@/lib/api/errors";
import { openaiError, resolveCatalogModel } from "@/lib/openai-compat";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  findIdempotentResponse,
  readIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/idempotency";
import { isUnsafeImageUrlError } from "@/lib/net/safe-url";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ChatMessage = {
  role?: string;
  content?: unknown;
};

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
    if (typeof raw === "string" && (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw))) {
      urls.push(raw);
    }
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

/**
 * OpenAI-compatible chat completions, billed as AIway raw mode.
 * Supports stream:true (SSE). Images force non-stream path.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const requestId = randomUUID();
  let holdAmount = 0;
  let accountId: string | undefined;

  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    accountId = auth.account.id;
    const modes = await getModeSettings();
    assertRateLimit(auth.site.id, modes.rate_limit_per_minute);

    if (!modes.raw_mode_enabled) {
      throw new ModeForbiddenError("Raw mode is disabled by admin (global switch)");
    }
    if (!auth.site.raw_enabled) {
      throw new ModeForbiddenError(
        "Raw mode is disabled for this site. Ask admin to enable site.raw_enabled.",
      );
    }

    const idemKey = readIdempotencyKey(req);
    if (idemKey) {
      const hit = await findIdempotentResponse(auth.site.id, idemKey);
      if (hit) {
        return NextResponse.json(hit.response_body, {
          headers: {
            "Idempotent-Replay": "true",
            "X-Request-Id": hit.request_id,
          },
        });
      }
    }

    const json = (await req.json().catch(() => null)) as {
      model?: string;
      messages?: ChatMessage[];
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    } | null;

    const modelName = String(json?.model || "").trim();
    const messages = Array.isArray(json?.messages) ? json.messages : [];
    if (!modelName) {
      return openaiError(400, "Missing model. Use a catalog id such as google/gemini-2.5-flash.");
    }
    if (messages.length === 0) {
      return openaiError(400, "Missing messages[]");
    }

    const parsed = parseMessages(messages);
    const model = await resolveCatalogModel(modelName);
    if (!model) {
      return openaiError(
        404,
        `Model not found or disabled in AIway catalog: ${modelName}. Try google/gemini-2.5-flash`,
        "model_not_found",
      );
    }

    const maxTokens =
      typeof json?.max_tokens === "number" && json.max_tokens > 0
        ? Math.min(json.max_tokens, 16000)
        : 2048;
    const temperature =
      typeof json?.temperature === "number" ? json.temperature : 0.7;
    const wantStream = Boolean(json?.stream) && parsed.image_urls.length === 0;

    holdAmount = estimateHoldCost({
      inputPricePer1m: Number(model.input_price_per_1m),
      outputPricePer1m: Number(model.output_price_per_1m),
      maxTokens,
      imageCount: parsed.image_urls.length,
      minCostPerCall: Number(model.min_cost_per_call || 0),
    });
    await reserveHold({
      accountId: auth.account.id,
      amount: holdAmount,
      requestId,
    });

    const sql = getSql();

    // Streaming text-only path
    if (wantStream) {
      try {
        const result = streamText({
          model: gateway(model.model_id),
          system: parsed.system || undefined,
          prompt: parsed.prompt,
          temperature,
          maxOutputTokens: maxTokens,
        });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
              );
            };
            try {
              for await (const delta of result.textStream) {
                send({
                  id: `chatcmpl-${requestId}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: model.model_id,
                  choices: [
                    {
                      index: 0,
                      delta: { content: delta },
                      finish_reason: null,
                    },
                  ],
                });
              }
              const usage = await result.usage;
              const inputTokens = usage?.inputTokens ?? 0;
              const outputTokens = usage?.outputTokens ?? 0;
              const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
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
                  input_tokens, output_tokens, total_tokens, cost, status, latency_ms
                ) VALUES (
                  ${requestId}, ${auth.site.id}, ${auth.account.id}, 'raw',
                  ${model.model_id}, ${inputTokens}, ${outputTokens}, ${totalTokens},
                  ${cost}, 'success', ${Date.now() - started}
                )
                RETURNING id
              `;
              await chargeAccount({
                accountId: auth.account.id,
                siteId: auth.site.id,
                amount: cost,
                usageLogId: logRows[0].id,
                note: `openai-compat-stream:${model.model_id}`,
                holdAmount,
              });
              holdAmount = 0;

              send({
                id: `chatcmpl-${requestId}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: model.model_id,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: {
                  prompt_tokens: inputTokens,
                  completion_tokens: outputTokens,
                  total_tokens: totalTokens,
                },
              });
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (err) {
              if (holdAmount > 0) {
                await releaseHold({
                  accountId: auth.account.id,
                  amount: holdAmount,
                }).catch(() => undefined);
                holdAmount = 0;
              }
              controller.error(err);
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Request-Id": requestId,
          },
        });
      } catch (err) {
        if (holdAmount > 0) {
          await releaseHold({ accountId: auth.account.id, amount: holdAmount });
          holdAmount = 0;
        }
        throw err;
      }
    }

    let outputText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    try {
      const result = await runGatewayModel({
        modelId: model.model_id,
        system: parsed.system,
        prompt: parsed.prompt,
        temperature,
        maxTokens,
        input: { image_urls: parsed.image_urls },
      });
      outputText = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      totalTokens = result.totalTokens || inputTokens + outputTokens;
    } catch (err) {
      console.error("vision completions upstream error", requestId, err);
      const message = formatUpstreamError(err);
      await releaseHold({ accountId: auth.account.id, amount: holdAmount });
      holdAmount = 0;
      if (isUnsafeImageUrlError(err)) {
        return openaiError(400, message, "400");
      }
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
      return openaiError(502, `Upstream model failed: ${message}`, "502");
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
        holdAmount,
      });
      holdAmount = 0;
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

    const body = {
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

    return NextResponse.json(body);
  } catch (err) {
    if (holdAmount > 0 && accountId) {
      await releaseHold({ accountId, amount: holdAmount }).catch(() => undefined);
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: {
            message: err.message,
            type: "rate_limit_error",
            code: "429",
          },
        },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSec) } },
      );
    }
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
