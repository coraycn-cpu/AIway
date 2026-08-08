import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const taskSchema = z.object({
  task_code: z.string().min(1),
  name: z.string().min(1),
  default_model_id: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const sql = getSql();
    const rows = await sql`SELECT * FROM tasks ORDER BY created_at DESC`;
    return jsonOk({ items: rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = taskSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid task payload");
    const sql = getSql();
    const rows = await sql`
      INSERT INTO tasks (task_code, name, default_model_id, temperature, max_tokens, status)
      VALUES (
        ${body.data.task_code},
        ${body.data.name},
        ${body.data.default_model_id},
        ${body.data.temperature ?? 0.7},
        ${body.data.max_tokens ?? 2048},
        ${body.data.status ?? "active"}
      )
      RETURNING *
    `;
    return jsonOk({ item: rows[0] }, { status: 201 });
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
        name: z.string().optional(),
        default_model_id: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        max_tokens: z.number().int().positive().optional(),
        status: z.enum(["active", "disabled"]).optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid task patch");

    const sql = getSql();
    await sql`
      UPDATE tasks SET
        name = COALESCE(${body.data.name ?? null}, name),
        default_model_id = COALESCE(${body.data.default_model_id ?? null}, default_model_id),
        temperature = COALESCE(${body.data.temperature ?? null}, temperature),
        max_tokens = COALESCE(${body.data.max_tokens ?? null}, max_tokens),
        status = COALESCE(${body.data.status ?? null}, status),
        updated_at = NOW()
      WHERE id = ${body.data.id}
    `;
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
