import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { parseInputSchema } from "@/lib/prompts";
import { emptyToNull, ensureListIndexes, listMeta, parseListQuery } from "@/lib/admin/list-query";

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

export async function GET(req: Request) {
  try {
    await requireAdmin();
    await ensureListIndexes();
    const url = new URL(req.url);
    const { page, pageSize, offset, q, status } = parseListQuery(url, { pageSize: 20 });
    const promptStatus = emptyToNull(url.searchParams.get("prompt_status"));

    const sql = getSql();

    const countPromise = sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total
      FROM tasks t
      WHERE (${status}::text IS NULL OR t.status = ${status})
        AND (
          ${q}::text IS NULL
          OR t.task_code ILIKE '%' || ${q} || '%'
          OR t.name ILIKE '%' || ${q} || '%'
          OR COALESCE(t.description, '') ILIKE '%' || ${q} || '%'
          OR t.default_model_id ILIKE '%' || ${q} || '%'
        )
        AND (
          ${promptStatus}::text IS NULL
          OR (
            ${promptStatus} = 'missing_global'
            AND NOT EXISTS (
              SELECT 1 FROM prompt_templates p
              WHERE p.task_id = t.id AND p.site_id IS NULL AND p.is_active = TRUE
            )
          )
          OR (
            ${promptStatus} = 'has_global'
            AND EXISTS (
              SELECT 1 FROM prompt_templates p
              WHERE p.task_id = t.id AND p.site_id IS NULL AND p.is_active = TRUE
            )
          )
        )
    `;

    const rowsPromise = sql`
      SELECT
        t.id, t.task_code, t.name, t.description, t.default_model_id,
        t.temperature::text AS temperature, t.max_tokens, t.status, t.input_schema,
        t.created_at, t.updated_at,
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
      WHERE (${status}::text IS NULL OR t.status = ${status})
        AND (
          ${q}::text IS NULL
          OR t.task_code ILIKE '%' || ${q} || '%'
          OR t.name ILIKE '%' || ${q} || '%'
          OR COALESCE(t.description, '') ILIKE '%' || ${q} || '%'
          OR t.default_model_id ILIKE '%' || ${q} || '%'
        )
        AND (
          ${promptStatus}::text IS NULL
          OR (
            ${promptStatus} = 'missing_global'
            AND NOT EXISTS (
              SELECT 1 FROM prompt_templates p
              WHERE p.task_id = t.id AND p.site_id IS NULL AND p.is_active = TRUE
            )
          )
          OR (
            ${promptStatus} = 'has_global'
            AND EXISTS (
              SELECT 1 FROM prompt_templates p
              WHERE p.task_id = t.id AND p.site_id IS NULL AND p.is_active = TRUE
            )
          )
        )
      ORDER BY t.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const [countRows, rows] = await Promise.all([countPromise, rowsPromise]);
    return jsonOk({
      items: rows.map((r) => ({
        ...r,
        input_schema: parseInputSchema(r.input_schema),
      })),
      ...listMeta(page, pageSize, Number(countRows[0]?.total ?? 0)),
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
