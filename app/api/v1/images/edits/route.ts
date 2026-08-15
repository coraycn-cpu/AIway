import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/auth";
import { runGatewayImageEdit, formatUpstreamError, type ImageEditInput } from "@/lib/ai";
import { assertCanSpend, calcCost, chargeAccount } from "@/lib/billing";
import { getSql } from "@/lib/db";
import { getModeSettings, ModeForbiddenError } from "@/lib/settings";
import { handleApiError } from "@/lib/api/errors";
import { openaiError, resolveCatalogModel } from "@/lib/openai-compat";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIN_PER_IMAGE_USD = 0.03;

function asUint8(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

async function fileToInput(file: File): Promise<ImageEditInput> {
  const data = asUint8(await file.arrayBuffer());
  const mediaType =
    file.type && file.type.startsWith("image/")
      ? file.type
      : "image/png";
  return { data, mediaType };
}

function dataUriToInput(raw: string): ImageEditInput | null {
  const match = raw
    .trim()
    .match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  return {
    mediaType: match[1].toLowerCase(),
    data: new Uint8Array(Buffer.from(match[2].replace(/\s/g, ""), "base64")),
  };
}

async function urlToInput(url: string): Promise<ImageEditInput> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to fetch image URL (${res.status})`);
  const mediaType =
    res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  if (!mediaType.startsWith("image/")) {
    throw new Error("URL did not return an image");
  }
  return { data: asUint8(await res.arrayBuffer()), mediaType };
}

async function parseRequest(req: Request): Promise<{
  model: string;
  prompt: string;
  images: ImageEditInput[];
  n: number;
  responseFormat: "b64_json" | "url";
}> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const model = String(form.get("model") || "").trim();
    const prompt = String(form.get("prompt") || "").trim();
    const n = Math.min(Math.max(Number(form.get("n") || 1) || 1, 1), 4);
    const responseFormat =
      String(form.get("response_format") || "b64_json").toLowerCase() === "url"
        ? "url"
        : "b64_json";

    const images: ImageEditInput[] = [];
    for (const [key, value] of form.entries()) {
      if (!(value instanceof File) || value.size <= 0) continue;
      if (key === "image" || key === "image[]" || /^image\[\d+\]$/.test(key)) {
        images.push(await fileToInput(value));
      }
    }
    // some clients send image as string field
    const imageField = form.get("image");
    if (images.length === 0 && typeof imageField === "string") {
      if (imageField.startsWith("data:image/")) {
        const parsed = dataUriToInput(imageField);
        if (parsed) images.push(parsed);
      } else if (/^https?:\/\//i.test(imageField)) {
        images.push(await urlToInput(imageField));
      }
    }

    return { model, prompt, images: images.slice(0, 6), n, responseFormat };
  }

  const json = (await req.json().catch(() => null)) as {
    model?: string;
    prompt?: string;
    n?: number;
    response_format?: string;
    image?: string | string[];
    images?: string[];
    image_url?: string;
    image_urls?: string[];
  } | null;

  const model = String(json?.model || "").trim();
  const prompt = String(json?.prompt || "").trim();
  const n = Math.min(Math.max(Number(json?.n || 1) || 1, 1), 4);
  const responseFormat =
    String(json?.response_format || "b64_json").toLowerCase() === "url"
      ? "url"
      : "b64_json";

  const refs: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) refs.push(v.trim());
    else if (Array.isArray(v)) v.forEach(push);
  };
  push(json?.image);
  push(json?.images);
  push(json?.image_url);
  push(json?.image_urls);

  const images: ImageEditInput[] = [];
  for (const ref of refs.slice(0, 6)) {
    if (ref.startsWith("data:image/")) {
      const parsed = dataUriToInput(ref);
      if (parsed) images.push(parsed);
    } else if (/^https?:\/\//i.test(ref)) {
      images.push(await urlToInput(ref));
    }
  }

  return { model, prompt, images, n, responseFormat };
}

/**
 * OpenAI-compatible image edits.
 * PackFlow「OpenAI 兼容图片编辑接口」POST {base}/images/edits
 * Billed as raw (requires global + site Raw).
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

    let parsed;
    try {
      parsed = await parseRequest(req);
    } catch (err) {
      return openaiError(
        400,
        err instanceof Error ? err.message : "Invalid images/edits body",
      );
    }

    if (!parsed.model) {
      return openaiError(
        400,
        "Missing model. Use google/gemini-3.1-flash-lite-image",
      );
    }
    if (!parsed.prompt) {
      return openaiError(400, "Missing prompt");
    }
    if (parsed.images.length === 0) {
      return openaiError(
        400,
        "Missing image. Send multipart field `image` or JSON image/data URI/https URL",
      );
    }

    const model = await resolveCatalogModel(parsed.model);
    if (!model) {
      return openaiError(
        404,
        `Model not found or disabled in AIway catalog: ${parsed.model}. Try google/gemini-3.1-flash-lite-image`,
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
        prompt: parsed.prompt,
        images: parsed.images,
        n: parsed.n,
      });
      images = result.images;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      totalTokens = result.totalTokens || inputTokens + outputTokens;
    } catch (err) {
      console.error("images/edits upstream error", requestId, err);
      const message = formatUpstreamError(err);
      await sql`
        INSERT INTO usage_logs (
          request_id, site_id, account_id, task_code, model_id,
          input_tokens, output_tokens, total_tokens, cost, status,
          error_code, error_message, latency_ms
        ) VALUES (
          ${requestId}, ${auth.site.id}, ${auth.account.id}, 'image_edit',
          ${model.model_id}, 0, 0, 0, 0, 'error', '502', ${message},
          ${Date.now() - started}
        )
      `;
      return openaiError(502, `Upstream model failed: ${message}`, "502");
    }

    if (images.length === 0) {
      return openaiError(502, "Upstream returned no image", "502");
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
        ${requestId}, ${auth.site.id}, ${auth.account.id}, 'image_edit',
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
        note: `images/edits:${model.model_id}`,
      });
    } catch (err) {
      await sql`
        UPDATE usage_logs
        SET status = 'rejected', error_code = '402', error_message = 'Insufficient balance after call'
        WHERE id = ${logRows[0].id}
      `;
      throw err;
    }

    // OpenAI images API returns b64_json; url mode is not hosted — return data URIs.
    const data =
      parsed.responseFormat === "url"
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
