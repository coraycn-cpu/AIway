import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
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
    const taskId = emptyToNull(url.searchParams.get("task_id"));
    const siteId = emptyToNull(url.searchParams.get("site_id"));
    const scope = emptyToNull(url.searchParams.get("scope"));
    const activeParam = emptyToNull(url.searchParams.get("active"));
    const isActive =
      activeParam === null ? null : activeParam === "true" || activeParam === "1";

    const sql = getSql();
    const countPromise = sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total
      FROM prompt_templates p
      JOIN tasks t ON t.id = p.task_id
      LEFT JOIN sites s ON s.id = p.site_id
      WHERE (${taskId}::uuid IS NULL OR p.task_id = ${taskId}::uuid)
        AND (${siteId}::uuid IS NULL OR p.site_id = ${siteId}::uuid)
        AND (${isActive}::boolean IS NULL OR p.is_active = ${isActive})
        AND (
          ${scope}::text IS NULL
          OR (${scope} = 'global' AND p.site_id IS NULL)
          OR (${scope} = 'site' AND p.site_id IS NOT NULL)
        )
        AND (
          ${q}::text IS NULL
          OR t.task_code ILIKE '%' || ${q} || '%'
          OR COALESCE(s.code, '') ILIKE '%' || ${q} || '%'
          OR p.user_template ILIKE '%' || ${q} || '%'
          OR COALESCE(p.system_template, '') ILIKE '%' || ${q} || '%'
        )
    `;
    const rowsPromise = sql`
      SELECT p.id, p.task_id, p.site_id, p.version, p.is_active, p.updated_at, p.created_at,
             LEFT(COALESCE(p.user_template, ''), 120) AS user_template,
             t.task_code, s.code AS site_code
      FROM prompt_templates p
      JOIN tasks t ON t.id = p.task_id
      LEFT JOIN sites s ON s.id = p.site_id
      WHERE (${taskId}::uuid IS NULL OR p.task_id = ${taskId}::uuid)
        AND (${siteId}::uuid IS NULL OR p.site_id = ${siteId}::uuid)
        AND (${isActive}::boolean IS NULL OR p.is_active = ${isActive})
        AND (
          ${scope}::text IS NULL
          OR (${scope} = 'global' AND p.site_id IS NULL)
          OR (${scope} = 'site' AND p.site_id IS NOT NULL)
        )
        AND (
          ${q}::text IS NULL
          OR t.task_code ILIKE '%' || ${q} || '%'
          OR COALESCE(s.code, '') ILIKE '%' || ${q} || '%'
          OR p.user_template ILIKE '%' || ${q} || '%'
          OR COALESCE(p.system_template, '') ILIKE '%' || ${q} || '%'
        )
      ORDER BY p.updated_at DESC
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
