import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { recharge } from "@/lib/billing";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const accountId = new URL(req.url).searchParams.get("account_id");
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM balance_ledgers
      WHERE (${accountId}::uuid IS NULL OR account_id = ${accountId}::uuid)
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return jsonOk({ items: rows });
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
