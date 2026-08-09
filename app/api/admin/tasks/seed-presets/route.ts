import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api/errors";
import { CAPABILITY_PRESETS } from "@/lib/presets/capabilities";

export const dynamic = "force-dynamic";

async function ensureTaskColumns() {
  const sql = getSql();
  await sql.unsafe(`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS input_schema JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
}

export async function GET() {
  try {
    await requireAdmin();
    await ensureTaskColumns();
    const sql = getSql();
    const codes = CAPABILITY_PRESETS.map((p) => p.task_code);
    const rows = await sql<{ task_code: string; status: string }[]>`
      SELECT task_code, status FROM tasks WHERE task_code = ANY(${codes})
    `;
    const present = new Set(rows.map((r) => r.task_code));
    const missing = codes.filter((c) => !present.has(c));
    const disabled = rows.filter((r) => r.status !== "active").map((r) => r.task_code);

    return jsonOk({
      expected: codes,
      present: [...present],
      missing,
      disabled,
      ready: missing.length === 0 && disabled.length === 0,
      tip:
        missing.length || disabled.length
          ? "预置能力未齐，请点击「同步预置能力」。"
          : "预置能力已就绪。",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST() {
  try {
    await requireAdmin();
    await ensureTaskColumns();
    const sql = getSql();
    const results: Array<{
      task_code: string;
      task_id: string;
      prompt_version: number;
      action: string;
    }> = [];

    for (const preset of CAPABILITY_PRESETS) {
      const upserted = await sql.begin(async (tx) => {
        const existing = await tx<{ id: string }[]>`
          SELECT id FROM tasks WHERE task_code = ${preset.task_code} LIMIT 1
        `;

        let taskId = existing[0]?.id;
        if (taskId) {
          await tx`
            UPDATE tasks SET
              name = ${preset.name},
              description = ${preset.description},
              default_model_id = ${preset.default_model_id},
              temperature = ${preset.temperature},
              max_tokens = ${preset.max_tokens},
              input_schema = ${tx.json(preset.input_schema)},
              status = 'active',
              updated_at = NOW()
            WHERE id = ${taskId}
          `;
        } else {
          const created = await tx<{ id: string }[]>`
            INSERT INTO tasks (
              task_code, name, description, default_model_id,
              temperature, max_tokens, status, input_schema
            ) VALUES (
              ${preset.task_code},
              ${preset.name},
              ${preset.description},
              ${preset.default_model_id},
              ${preset.temperature},
              ${preset.max_tokens},
              'active',
              ${tx.json(preset.input_schema)}
            )
            RETURNING id
          `;
          taskId = created[0].id;
        }

        await tx`
          UPDATE prompt_templates
          SET is_active = FALSE, updated_at = NOW()
          WHERE task_id = ${taskId} AND site_id IS NULL
        `;

        const versionRows = await tx<{ version: number }[]>`
          SELECT COALESCE(MAX(version), 0) AS version
          FROM prompt_templates
          WHERE task_id = ${taskId} AND site_id IS NULL
        `;
        const version = Number(versionRows[0]?.version ?? 0) + 1;

        await tx`
          INSERT INTO prompt_templates (
            task_id, site_id, system_template, user_template, version, is_active
          ) VALUES (
            ${taskId},
            NULL,
            ${preset.system_template},
            ${preset.user_template},
            ${version},
            TRUE
          )
        `;

        return {
          task_code: preset.task_code,
          task_id: taskId!,
          prompt_version: version,
          action: existing[0] ? "updated" : "created",
        };
      });

      results.push(upserted);
    }

    return jsonOk({
      ok: true,
      items: results,
      tip: "已同步预置能力：apparel_image_enrich、blog_topic_recommend、blog_seo_article。请回到业务站重试。",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
