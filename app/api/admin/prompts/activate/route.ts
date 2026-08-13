import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({ id: z.string().uuid() })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid activate payload");

    const sql = getSql();
    const rows = await sql<
      { id: string; task_id: string; site_id: string | null; version: number }[]
    >`
      SELECT id, task_id, site_id, version FROM prompt_templates WHERE id = ${body.data.id} LIMIT 1
    `;
    const prompt = rows[0];
    if (!prompt) return jsonError(404, "404", "Prompt not found");

    await sql.begin(async (tx) => {
      await tx`
        UPDATE prompt_templates
        SET is_active = FALSE, updated_at = NOW()
        WHERE task_id = ${prompt.task_id}
          AND (
            (${prompt.site_id}::uuid IS NULL AND site_id IS NULL)
            OR site_id = ${prompt.site_id}::uuid
          )
      `;
      await tx`
        UPDATE prompt_templates
        SET is_active = TRUE, updated_at = NOW()
        WHERE id = ${prompt.id}
      `;
    });

    return jsonOk({
      ok: true,
      activated_id: prompt.id,
      version: prompt.version,
      scope: prompt.site_id ? "site" : "global",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
