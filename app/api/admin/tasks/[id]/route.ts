import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { parseInputSchema } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const sql = getSql();

    const tasks = await sql`
      SELECT * FROM tasks WHERE id = ${id} LIMIT 1
    `;
    if (!tasks[0]) return jsonError(404, "404", "Task not found");

    const [prompts, sites, activeBySite] = await Promise.all([
      sql`
        SELECT p.*, s.code AS site_code, s.name AS site_name
        FROM prompt_templates p
        LEFT JOIN sites s ON s.id = p.site_id
        WHERE p.task_id = ${id}
        ORDER BY
          CASE WHEN p.site_id IS NULL THEN 0 ELSE 1 END,
          s.code NULLS FIRST,
          p.version DESC
      `,
      sql`SELECT id, code, name, status FROM sites ORDER BY code`,
      sql`
        SELECT p.site_id, s.code AS site_code, p.version, p.id AS prompt_id
        FROM prompt_templates p
        JOIN sites s ON s.id = p.site_id
        WHERE p.task_id = ${id} AND p.is_active = TRUE AND p.site_id IS NOT NULL
      `,
    ]);

    const hasGlobal = prompts.some(
      (p) => p.site_id == null && p.is_active === true,
    );

    return jsonOk({
      task: {
        ...tasks[0],
        input_schema: parseInputSchema(tasks[0].input_schema),
      },
      prompts,
      sites,
      coverage: {
        has_global_prompt: hasGlobal,
        site_overrides: activeBySite,
        sites_using_global: sites
          .filter((s) => !activeBySite.some((o) => o.site_id === s.id))
          .map((s) => ({ id: s.id, code: s.code, name: s.name })),
      },
      guide: {
        principle:
          "Task=能力名；Prompt=怎么执行。服装/五金等行业差异优先用「同一 task + 站点提示词覆盖」。",
        resolve_order: ["站点专属激活提示词", "全局默认激活提示词"],
        business_call: {
          task: tasks[0].task_code,
          input_fields: parseInputSchema(tasks[0].input_schema).map((f) => f.key),
        },
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
