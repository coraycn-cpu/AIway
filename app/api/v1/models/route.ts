import { NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/auth";
import { listEnabledCatalogModels } from "@/lib/catalog";
import { getModeSettings, ModeForbiddenError } from "@/lib/settings";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api/errors";
import { openaiError } from "@/lib/openai-compat";

export const dynamic = "force-dynamic";

/**
 * OpenAI-compatible model list.
 * GET /api/v1/models
 */
export async function GET(req: Request) {
  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    const modes = await getModeSettings();
    assertRateLimit(auth.site.id, modes.rate_limit_per_minute);

    const models = await listEnabledCatalogModels();
    const created = Math.floor(Date.now() / 1000);

    return NextResponse.json({
      object: "list",
      data: models.map((m) => {
        const slash = m.model_id.indexOf("/");
        const owned_by = slash > 0 ? m.model_id.slice(0, slash) : "aiway";
        return {
          id: m.model_id,
          object: "model" as const,
          owned_by,
          created,
        };
      }),
    });
  } catch (err) {
    if (err instanceof ModeForbiddenError) {
      return openaiError(err.status, err.message, err.code);
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: {
            message: err.message,
            type: "api_error",
            code: "429",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(err.retryAfterSec) },
        },
      );
    }
    const mapped = handleApiError(err);
    const retryAfter = mapped.headers.get("Retry-After");
    const body = await mapped.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String(
            (body as { error?: { message?: string } }).error?.message ||
              mapped.statusText,
          )
        : mapped.statusText;
    if (retryAfter) {
      return NextResponse.json(
        {
          error: {
            message: message || "Request failed",
            type: "api_error",
            code: String(mapped.status),
          },
        },
        { status: mapped.status, headers: { "Retry-After": retryAfter } },
      );
    }
    return openaiError(mapped.status, message || "Request failed");
  }
}
