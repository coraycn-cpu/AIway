import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { emptyToNull, ensureListIndexes, listMeta, parseListQuery } from "@/lib/admin/list-query";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    await ensureListIndexes();
    const url = new URL(req.url);
    const { page, pageSize, offset, q } = parseListQuery(url, { pageSize: 50 });
    let provider = emptyToNull(url.searchParams.get("provider"));
    if (provider === "gemini") provider = "google";
    const enabledParam = emptyToNull(url.searchParams.get("enabled"));
    const enabled =
      enabledParam === null ? null : enabledParam === "true" || enabledParam === "1";

    const sql = getSql();
    const countPromise = sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total
      FROM model_catalog
      WHERE (${provider}::text IS NULL OR split_part(model_id, '/', 1) = ${provider})
        AND (${enabled}::boolean IS NULL OR enabled = ${enabled})
        AND (
          ${q}::text IS NULL
          OR model_id ILIKE '%' || ${q} || '%'
          OR display_name ILIKE '%' || ${q} || '%'
        )
    `;
    const rowsPromise = sql`
      SELECT id, model_id, display_name,
             input_price_per_1m::text AS input_price_per_1m,
             output_price_per_1m::text AS output_price_per_1m,
             enabled, created_at, updated_at
      FROM model_catalog
      WHERE (${provider}::text IS NULL OR split_part(model_id, '/', 1) = ${provider})
        AND (${enabled}::boolean IS NULL OR enabled = ${enabled})
        AND (
          ${q}::text IS NULL
          OR model_id ILIKE '%' || ${q} || '%'
          OR display_name ILIKE '%' || ${q} || '%'
        )
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    const [countRows, rows] = await Promise.all([countPromise, rowsPromise]);
    return jsonOk({
      items: rows,
      ...listMeta(page, pageSize, Number(countRows[0]?.total ?? 0)),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        model_id: z.string().min(1),
        display_name: z.string().min(1),
        input_price_per_1m: z.number().nonnegative(),
        output_price_per_1m: z.number().nonnegative(),
        enabled: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid model payload");

    const sql = getSql();
    const rows = await sql`
      INSERT INTO model_catalog (model_id, display_name, input_price_per_1m, output_price_per_1m, enabled)
      VALUES (
        ${body.data.model_id},
        ${body.data.display_name},
        ${body.data.input_price_per_1m},
        ${body.data.output_price_per_1m},
        ${body.data.enabled ?? true}
      )
      ON CONFLICT (model_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        input_price_per_1m = EXCLUDED.input_price_per_1m,
        output_price_per_1m = EXCLUDED.output_price_per_1m,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
      RETURNING *
    `;
    return jsonOk({ item: rows[0] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        id: z.string().uuid(),
        display_name: z.string().optional(),
        input_price_per_1m: z.number().nonnegative().optional(),
        output_price_per_1m: z.number().nonnegative().optional(),
        enabled: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid model patch");

    const sql = getSql();
    await sql`
      UPDATE model_catalog SET
        display_name = COALESCE(${body.data.display_name ?? null}, display_name),
        input_price_per_1m = COALESCE(${body.data.input_price_per_1m ?? null}, input_price_per_1m),
        output_price_per_1m = COALESCE(${body.data.output_price_per_1m ?? null}, output_price_per_1m),
        enabled = COALESCE(${body.data.enabled ?? null}, enabled),
        updated_at = NOW()
      WHERE id = ${body.data.id}
    `;
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
