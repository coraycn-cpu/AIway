import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { recharge } from "@/lib/billing";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { emptyToNull, ensureListIndexes, listMeta, parseListQuery } from "@/lib/admin/list-query";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    await ensureListIndexes();
    const url = new URL(req.url);
    const { page, pageSize, offset, q } = parseListQuery(url, { pageSize: 20 });
    const accountId = emptyToNull(url.searchParams.get("account_id"));
    const type = emptyToNull(url.searchParams.get("type"));

    const sql = getSql();
    const countPromise = sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total
      FROM balance_ledgers
      WHERE (${accountId}::uuid IS NULL OR account_id = ${accountId}::uuid)
        AND (${type}::text IS NULL OR type = ${type})
        AND (
          ${q}::text IS NULL
          OR COALESCE(note, '') ILIKE '%' || ${q} || '%'
          OR COALESCE(created_by, '') ILIKE '%' || ${q} || '%'
        )
    `;
    const rowsPromise = sql`
      SELECT id, account_id, site_id, type, amount::text AS amount,
             balance_after::text AS balance_after, note, created_by, created_at
      FROM balance_ledgers
      WHERE (${accountId}::uuid IS NULL OR account_id = ${accountId}::uuid)
        AND (${type}::text IS NULL OR type = ${type})
        AND (
          ${q}::text IS NULL
          OR COALESCE(note, '') ILIKE '%' || ${q} || '%'
          OR COALESCE(created_by, '') ILIKE '%' || ${q} || '%'
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
    const admin = await requireAdmin();
    const body = z
      .object({
        account_id: z.string().uuid(),
        amount: z.number().positive(),
        note: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid recharge payload");

    const result = await recharge(
      body.data.account_id,
      body.data.amount,
      body.data.note ?? "Admin recharge",
      admin.email,
    );
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
