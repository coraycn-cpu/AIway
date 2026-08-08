import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { parseInputSchema } from "@/lib/prompts";

export const dynamic = "force-dynamic";

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  required: z.boolean().optional(),
  example: z.string().optional(),
});

const taskSchema = z.object({
  task_code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  default_model_id: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  input_schema: z.array(fieldSchema).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const sql = getSql();
    const rows = await sql`
      SELECT
        t.*,
        EXISTS (
          SELECT 1 FROM prompt_templates p
          WHERE p.task_id = t.id AND p.site_id IS NULL AND p.is_active = TRUE
        ) AS has_global_prompt,
        (
          SELECT COUNT(DISTINCT p.site_id)::int
          FROM prompt_templates p
          WHERE p.task_id = t.id AND p.site_id IS NOT NULL AND p.is_active = TRUE
        ) AS site_override_count
      FROM tasks t
      ORDER BY t.created_at DESC
    `;
    return jsonOk({
      items: rows.map((r) => ({
        ...r,
        input_schema: parseInputSchema(r.input_schema),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = taskSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid task payload");
    const schema = parseInputSchema(body.data.input_schema ?? []);
    const sql = getSql();
    const rows = await sql`
      INSERT INTO tasks (
        task_code, name, description, default_model_id, temperature, max_tokens, status, input_schema
      )
      VALUES (
        ${body.data.task_code},
        ${body.data.name},
        ${body.data.description ?? null},
        ${body.data.default_model_id},
        ${body.data.temperature ?? 0.7},
        ${body.data.max_tokens ?? 2048},
        ${body.data.status ?? "active"},
        ${sql.json(schema)}
      )
      RETURNING *
    `;
    return jsonOk(
      { item: { ...rows[0], input_schema: parseInputSchema(rows[0].input_schema) } },
      { status: 201 },
    );
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
        description: z.string().nullable().optional(),
        default_model_id: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        max_tokens: z.number().int().positive().optional(),
        status: z.enum(["active", "disabled"]).optional(),
        input_schema: z.array(fieldSchema).optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid task patch");

    const sql = getSql();
    if (body.data.input_schema !== undefined) {
      const schema = parseInputSchema(body.data.input_schema);
      await sql`
        UPDATE tasks SET
          name = COALESCE(${body.data.name ?? null}, name),
          description = CASE
            WHEN ${body.data.description !== undefined} THEN ${body.data.description ?? null}
            ELSE description
          END,
          default_model_id = COALESCE(${body.data.default_model_id ?? null}, default_model_id),
          temperature = COALESCE(${body.data.temperature ?? null}, temperature),
          max_tokens = COALESCE(${body.data.max_tokens ?? null}, max_tokens),
          status = COALESCE(${body.data.status ?? null}, status),
          input_schema = ${sql.json(schema)},
          updated_at = NOW()
        WHERE id = ${body.data.id}
      `;
    } else {
      await sql`
        UPDATE tasks SET
          name = COALESCE(${body.data.name ?? null}, name),
          description = CASE
            WHEN ${body.data.description !== undefined} THEN ${body.data.description ?? null}
            ELSE description
          END,
          default_model_id = COALESCE(${body.data.default_model_id ?? null}, default_model_id),
          temperature = COALESCE(${body.data.temperature ?? null}, temperature),
          max_tokens = COALESCE(${body.data.max_tokens ?? null}, max_tokens),
          status = COALESCE(${body.data.status ?? null}, status),
          updated_at = NOW()
        WHERE id = ${body.data.id}
      `;
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
