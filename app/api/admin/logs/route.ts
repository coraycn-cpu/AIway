import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 50)));
    const status = url.searchParams.get("status");
    const siteId = url.searchParams.get("site_id");
    const task = url.searchParams.get("task");
    const offset = (page - 1) * pageSize;

    const sql = getSql();
    const rows = await sql`
      SELECT u.*, s.code AS site_code
      FROM usage_logs u
      JOIN sites s ON s.id = u.site_id
      WHERE (${status}::text IS NULL OR u.status = ${status})
        AND (${siteId}::uuid IS NULL OR u.site_id = ${siteId}::uuid)
        AND (${task}::text IS NULL OR u.task_code = ${task})
      ORDER BY u.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    return jsonOk({ page, page_size: pageSize, items: rows });
  } catch (err) {
    return handleApiError(err);
  }
}
