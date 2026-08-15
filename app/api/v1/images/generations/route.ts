import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/auth";
import { runGatewayImageEdit, formatUpstreamError } from "@/lib/ai";
import { assertCanSpend, calcCost, chargeAccount } from "@/lib/billing";
import { getSql } from "@/lib/db";
import { getModeSettings, ModeForbiddenError } from "@/lib/settings";
import { handleApiError } from "@/lib/api/errors";
import { openaiError, resolveCatalogModel } from "@/lib/openai-compat";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIN_PER_IMAGE_USD = 0.03;

/**
 * OpenAI-compatible image generations (text → image).
 * POST {base}/images/generations
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
      prompt?: string;
      n?: number;
      response_format?: string;
    } | null;

    const modelName = String(json?.model || "").trim();
    const prompt = String(json?.prompt || "").trim();
    const n = Math.min(Math.max(Number(json?.n || 1) || 1, 1), 4);
    const responseFormat =
      String(json?.response_format || "b64_json").toLowerCase() === "url"
        ? "url"
        : "b64_json";

    if (!modelName) {
      return openaiError(
        400,
        "Missing model. Use google/gemini-3.1-flash-lite-image",
      );
    }
    if (!prompt) return openaiError(400, "Missing prompt");

    const model = await resolveCatalogModel(modelName);
    if (!model) {
      return openaiError(
        404,
        `Model not found or disabled: ${modelName}`,
        "model_not_found",
      );
    }

    await assertCanSpend(auth.account.id);
    const sql = getSql();

    let images: { b64_json: string; mediaType: string }[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    try {
      const result = await runGatewayImageEdit({
        modelId: model.model_id,
        prompt,
        images: [],
        n,
      });
      images = result.images;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      totalTokens = result.totalTokens || inputTokens + outputTokens;
    } catch (err) {
      console.error("images/generations upstream error", requestId, err);
      const message = formatUpstreamError(err);
      await sql`
        INSERT INTO usage_logs (
          request_id, site_id, account_id, task_code, model_id,
          input_tokens, output_tokens, total_tokens, cost, status,
          error_code, error_message, latency_ms
        ) VALUES (
          ${requestId}, ${auth.site.id}, ${auth.account.id}, 'image_gen',
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
    cost = Math.max(cost, images.length * MIN_PER_IMAGE_USD);
    cost = Math.round(cost * 1_000_000) / 1_000_000;

    const logRows = await sql<{ id: string }[]>`
      INSERT INTO usage_logs (
        request_id, site_id, account_id, task_code, model_id,
        input_tokens, output_tokens, total_tokens, cost, status, latency_ms
      ) VALUES (
        ${requestId}, ${auth.site.id}, ${auth.account.id}, 'image_gen',
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
        note: `images/generations:${model.model_id}`,
      });
    } catch (err) {
      await sql`
        UPDATE usage_logs
        SET status = 'rejected', error_code = '402', error_message = 'Insufficient balance after call'
        WHERE id = ${logRows[0].id}
      `;
      throw err;
    }

    const data =
      responseFormat === "url"
        ? images.map((img) => ({
            url: `data:${img.mediaType};base64,${img.b64_json}`,
          }))
        : images.map((img) => ({ b64_json: img.b64_json }));

    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      data,
      model: model.model_id,
      request_id: requestId,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost,
      },
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
