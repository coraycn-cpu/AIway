import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const sql = getSql();
    const rows = await sql`SELECT * FROM model_catalog ORDER BY created_at DESC`;
    return jsonOk({ items: rows });
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
