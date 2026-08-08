import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const sql = getSql();

    const sites = await sql`SELECT id, code, name, status FROM sites WHERE id = ${id} LIMIT 1`;
    if (!sites[0]) return jsonError(404, "404", "Site not found");

    const rows = await sql`
      SELECT
        t.id AS task_id,
        t.task_code,
        t.name AS task_name,
        t.status AS task_status,
        gp.id AS global_prompt_id,
        gp.version AS global_version,
        sp.id AS site_prompt_id,
        sp.version AS site_version,
        CASE
          WHEN sp.id IS NOT NULL THEN 'site'
          WHEN gp.id IS NOT NULL THEN 'global'
          ELSE 'missing'
        END AS resolve_scope
      FROM tasks t
      LEFT JOIN prompt_templates gp
        ON gp.task_id = t.id AND gp.site_id IS NULL AND gp.is_active = TRUE
      LEFT JOIN prompt_templates sp
        ON sp.task_id = t.id AND sp.site_id = ${id} AND sp.is_active = TRUE
      WHERE t.status = 'active'
      ORDER BY t.task_code
    `;

    return jsonOk({
      site: sites[0],
      items: rows,
      tip: "同一 task 可被所有站点调用；本表显示该站实际会命中「站点覆盖」还是「全局默认」。行业差异（服装/五金）优先做站点提示词覆盖，而不是拆很多 task。",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
