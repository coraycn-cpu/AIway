import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const siteId = new URL(req.url).searchParams.get("site_id");
    const sql = getSql();
    const rows = await sql`
      SELECT a.*, s.code AS site_code, s.name AS site_name
      FROM accounts a
      JOIN sites s ON s.id = a.site_id
      WHERE (${siteId}::uuid IS NULL OR a.site_id = ${siteId}::uuid)
      ORDER BY a.created_at DESC
    `;
    return jsonOk({ items: rows });
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
