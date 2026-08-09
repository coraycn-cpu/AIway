import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api/errors";
import { emptyToNull, ensureListIndexes, listMeta, parseListQuery } from "@/lib/admin/list-query";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    await ensureListIndexes();
    const url = new URL(req.url);
    const { page, pageSize, offset, q, status } = parseListQuery(url, { pageSize: 20 });
    const siteId = emptyToNull(url.searchParams.get("site_id"));
    const task = emptyToNull(url.searchParams.get("task"));
    const from = emptyToNull(url.searchParams.get("from"));
    const to = emptyToNull(url.searchParams.get("to"));

    const sql = getSql();

    const countPromise = sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total
      FROM usage_logs u
      JOIN sites s ON s.id = u.site_id
      WHERE (${status}::text IS NULL OR u.status = ${status})
        AND (${siteId}::uuid IS NULL OR u.site_id = ${siteId}::uuid)
        AND (${task}::text IS NULL OR u.task_code = ${task})
        AND (${from}::timestamptz IS NULL OR u.created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR u.created_at <= ${to}::timestamptz)
        AND (
          ${q}::text IS NULL
          OR u.request_id::text ILIKE '%' || ${q} || '%'
          OR COALESCE(u.task_code, '') ILIKE '%' || ${q} || '%'
          OR COALESCE(u.model_id, '') ILIKE '%' || ${q} || '%'
          OR COALESCE(u.error_message, '') ILIKE '%' || ${q} || '%'
          OR s.code ILIKE '%' || ${q} || '%'
          OR COALESCE(u.trace_id, '') ILIKE '%' || ${q} || '%'
        )
    `;

    const rowsPromise = sql`
      SELECT
        u.id, u.request_id, u.site_id, u.task_code, u.model_id,
        u.total_tokens, u.cost::text AS cost, u.status,
        LEFT(COALESCE(u.error_message, ''), 240) AS error_message,
        u.created_at, s.code AS site_code
      FROM usage_logs u
      JOIN sites s ON s.id = u.site_id
      WHERE (${status}::text IS NULL OR u.status = ${status})
        AND (${siteId}::uuid IS NULL OR u.site_id = ${siteId}::uuid)
        AND (${task}::text IS NULL OR u.task_code = ${task})
        AND (${from}::timestamptz IS NULL OR u.created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR u.created_at <= ${to}::timestamptz)
        AND (
          ${q}::text IS NULL
          OR u.request_id::text ILIKE '%' || ${q} || '%'
          OR COALESCE(u.task_code, '') ILIKE '%' || ${q} || '%'
          OR COALESCE(u.model_id, '') ILIKE '%' || ${q} || '%'
          OR COALESCE(u.error_message, '') ILIKE '%' || ${q} || '%'
          OR s.code ILIKE '%' || ${q} || '%'
          OR COALESCE(u.trace_id, '') ILIKE '%' || ${q} || '%'
        )
      ORDER BY u.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const [countRows, rows] = await Promise.all([countPromise, rowsPromise]);
    const total = Number(countRows[0]?.total ?? 0);

    return jsonOk({
      items: rows,
      ...listMeta(page, pageSize, total),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
