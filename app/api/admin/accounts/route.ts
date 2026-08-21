import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { ensureRelayHardeningSchema } from "@/lib/db/ensure-relay-hardening";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { emptyToNull, ensureListIndexes, listMeta, parseListQuery } from "@/lib/admin/list-query";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    await ensureRelayHardeningSchema();
    await ensureListIndexes();
    const url = new URL(req.url);
    const { page, pageSize, offset, q, status } = parseListQuery(url, { pageSize: 20 });
    const siteId = emptyToNull(url.searchParams.get("site_id"));

    const sql = getSql();
    const countPromise = sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total
      FROM accounts a
      JOIN sites s ON s.id = a.site_id
      WHERE (${siteId}::uuid IS NULL OR a.site_id = ${siteId}::uuid)
        AND (${status}::text IS NULL OR a.status = ${status})
        AND (
          ${q}::text IS NULL
          OR s.code ILIKE '%' || ${q} || '%'
          OR s.name ILIKE '%' || ${q} || '%'
        )
    `;
    const rowsPromise = sql`
      SELECT a.id, a.site_id, a.balance::text AS balance,
             COALESCE(a.held_balance, 0)::text AS held_balance,
             a.month_quota::text AS month_quota,
             a.status, a.created_at, a.updated_at, s.code AS site_code, s.name AS site_name
      FROM accounts a
      JOIN sites s ON s.id = a.site_id
      WHERE (${siteId}::uuid IS NULL OR a.site_id = ${siteId}::uuid)
        AND (${status}::text IS NULL OR a.status = ${status})
        AND (
          ${q}::text IS NULL
          OR s.code ILIKE '%' || ${q} || '%'
          OR s.name ILIKE '%' || ${q} || '%'
        )
      ORDER BY a.created_at DESC
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

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        id: z.string().uuid(),
        month_quota: z.number().nonnegative().nullable().optional(),
        status: z.enum(["active", "disabled"]).optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid account payload");

    const sql = getSql();
    await sql`
      UPDATE accounts
      SET
        month_quota = CASE WHEN ${body.data.month_quota !== undefined} THEN ${body.data.month_quota ?? null} ELSE month_quota END,
        status = COALESCE(${body.data.status ?? null}, status),
        updated_at = NOW()
      WHERE id = ${body.data.id}
    `;
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
