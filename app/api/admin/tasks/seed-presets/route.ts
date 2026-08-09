import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api/errors";
import { CAPABILITY_PRESETS } from "@/lib/presets/capabilities";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireAdmin();
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
      tip: "已预置：apparel_image_enrich（图片补全英文商品字段）、blog_topic_recommend（SEO/GEO 选题）、blog_seo_article（英文成稿+内链）。可在任务详情按站点再覆盖提示词。",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk({
      presets: CAPABILITY_PRESETS.map((p) => ({
        task_code: p.task_code,
        name: p.name,
        description: p.description,
        default_model_id: p.default_model_id,
        fields: p.input_schema.map((f) => f.key + (f.required ? "*" : "")),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
