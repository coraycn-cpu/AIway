import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const taskId = new URL(req.url).searchParams.get("task_id");
    const sql = getSql();
    const rows = await sql`
      SELECT p.*, t.task_code, s.code AS site_code
      FROM prompt_templates p
      JOIN tasks t ON t.id = p.task_id
      LEFT JOIN sites s ON s.id = p.site_id
      WHERE (${taskId}::uuid IS NULL OR p.task_id = ${taskId}::uuid)
      ORDER BY p.updated_at DESC
    `;
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
        task_id: z.string().uuid(),
        site_id: z.string().uuid().nullable().optional(),
        system_template: z.string().default(""),
        user_template: z.string().min(1),
        activate: z.boolean().default(true),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid prompt payload");

    const sql = getSql();
    const result = await sql.begin(async (tx) => {
      const siteId = body.data.site_id ?? null;
      const versionRows = await tx<{ version: number }[]>`
        SELECT COALESCE(MAX(version), 0) AS version
        FROM prompt_templates
        WHERE task_id = ${body.data.task_id}
          AND (
            (${siteId}::uuid IS NULL AND site_id IS NULL)
            OR site_id = ${siteId}::uuid
          )
      `;
      const version = Number(versionRows[0]?.version ?? 0) + 1;

      if (body.data.activate) {
        await tx`
          UPDATE prompt_templates
          SET is_active = FALSE, updated_at = NOW()
          WHERE task_id = ${body.data.task_id}
            AND (
              (${siteId}::uuid IS NULL AND site_id IS NULL)
              OR site_id = ${siteId}::uuid
            )
        `;
      }

      const rows = await tx`
        INSERT INTO prompt_templates (
          task_id, site_id, system_template, user_template, version, is_active
        ) VALUES (
          ${body.data.task_id},
          ${siteId},
          ${body.data.system_template},
          ${body.data.user_template},
          ${version},
          ${body.data.activate}
        )
        RETURNING *
      `;
      return rows[0];
    });

    return jsonOk({ item: result }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
