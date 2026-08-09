import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  month_quota: z.number().nonnegative().nullable().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const { ensureSettingsSchema } = await import("@/lib/settings");
    await ensureSettingsSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT s.*, a.id AS account_id, a.balance::text AS balance, a.month_quota::text AS month_quota, a.status AS account_status
      FROM sites s
      LEFT JOIN accounts a ON a.site_id = s.id
      ORDER BY s.created_at DESC
    `;
    return jsonOk({ items: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "400", "Invalid site payload");

    const sql = getSql();
    const result = await sql.begin(async (tx) => {
      const sites = await tx<{ id: string; code: string; name: string }[]>`
        INSERT INTO sites (code, name)
        VALUES (${parsed.data.code}, ${parsed.data.name})
        RETURNING id, code, name
      `;
      const site = sites[0];
      const accounts = await tx<{ id: string }[]>`
        INSERT INTO accounts (site_id, balance, month_quota)
        VALUES (${site.id}, 0, ${parsed.data.month_quota ?? null})
        RETURNING id
      `;
      return { site, account_id: accounts[0].id };
    });

    return jsonOk(result, { status: 201 });
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
        status: z.enum(["active", "disabled"]).optional(),
        name: z.string().min(1).optional(),
        raw_enabled: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid patch payload");

    const { ensureSettingsSchema } = await import("@/lib/settings");
    await ensureSettingsSchema();
    const sql = getSql();
    await sql`
      UPDATE sites
      SET
        status = COALESCE(${body.data.status ?? null}, status),
        name = COALESCE(${body.data.name ?? null}, name),
        raw_enabled = CASE
          WHEN ${body.data.raw_enabled !== undefined} THEN ${body.data.raw_enabled ?? false}
          ELSE raw_enabled
        END,
        updated_at = NOW()
      WHERE id = ${body.data.id}
    `;
    if (body.data.status) {
      await sql`
        UPDATE accounts SET status = ${body.data.status}, updated_at = NOW()
        WHERE site_id = ${body.data.id}
      `;
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
