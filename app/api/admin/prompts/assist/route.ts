import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { runGatewayModel } from "@/lib/ai";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { parseInputSchema } from "@/lib/prompts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  task_id: z.string().uuid().optional(),
  task_code: z.string().optional(),
  task_name: z.string().optional(),
  description: z.string().optional(),
  input_schema: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().optional(),
        required: z.boolean().optional(),
        example: z.string().optional(),
      }),
    )
    .optional(),
  scope: z.enum(["global", "site"]).default("global"),
  site_code: z.string().optional(),
  site_name: z.string().optional(),
  industry_hint: z.string().optional(),
  existing_system: z.string().optional(),
  existing_user: z.string().optional(),
  mode: z.enum(["draft", "improve"]).default("draft"),
  model_id: z.string().optional(),
});

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("AI 未返回可解析 JSON");
  return JSON.parse(raw.slice(start, end + 1)) as {
    system_template?: string;
    user_template?: string;
    notes?: string;
  };
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "400", "Invalid assist payload");

    const sql = getSql();
    let taskCode = parsed.data.task_code || "";
    let taskName = parsed.data.task_name || "";
    let description = parsed.data.description || "";
    let schema = parseInputSchema(parsed.data.input_schema || []);
    let modelId = parsed.data.model_id || "openai/gpt-4o-mini";

    if (parsed.data.task_id) {
      const rows = await sql<
        {
          task_code: string;
          name: string;
          description: string | null;
          input_schema: unknown;
          default_model_id: string;
        }[]
      >`SELECT task_code, name, description, input_schema, default_model_id FROM tasks WHERE id = ${parsed.data.task_id} LIMIT 1`;
      if (!rows[0]) return jsonError(404, "404", "Task not found");
      taskCode = rows[0].task_code;
      taskName = rows[0].name;
      description = rows[0].description || description;
      schema = parseInputSchema(rows[0].input_schema);
      modelId = parsed.data.model_id || rows[0].default_model_id || modelId;
    }

    if (!taskCode) return jsonError(400, "400", "task_code 或 task_id 必填");

    const fieldList =
      schema.length > 0
        ? schema
            .map(
              (f) =>
                `${f.key}${f.required ? "(必填)" : ""}` +
                (f.label && f.label !== f.key ? `/${f.label}` : ""),
            )
            .join(", ")
        : "（未声明，请自行设计合理变量）";

    const scopeText =
      parsed.data.scope === "site"
        ? `站点覆盖提示词，面向站点 ${parsed.data.site_code || ""} ${parsed.data.site_name || ""}`
        : "全局默认提示词，需适用于多数站点";

    const industry =
      parsed.data.industry_hint ||
      (parsed.data.scope === "site"
        ? `${parsed.data.site_name || parsed.data.site_code || "该站点"} 的行业话术`
        : "通用电商/业务场景");

    const modeHint =
      parsed.data.mode === "improve"
        ? "请在现有草稿基础上改进，保留可用变量，使指令更清晰可执行。"
        : "请从零起草一套可直接使用的提示词。";

    const result = await runGatewayModel({
      modelId,
      temperature: 0.4,
      maxTokens: 1200,
      system: `你是提示词工程师，为 AI 调用中台撰写 system/user 模板。
要求：
1. user_template 必须使用 {{field}} 形式引用输入字段，字段名只能来自给定列表（若列表为空可合理自拟）。
2. 不要写 markdown 标题，不要解释过程。
3. 只输出 JSON：{"system_template":"...","user_template":"...","notes":"一句话说明"}
4. system 简洁稳定；user 包含明确输出要求。
5. 中文撰写。`,
      prompt: `${modeHint}

任务 code: ${taskCode}
任务名: ${taskName}
任务说明: ${description || "无"}
作用范围: ${scopeText}
行业/风格: ${industry}
可用字段: ${fieldList}

现有 system:
${parsed.data.existing_system || "（空）"}

现有 user:
${parsed.data.existing_user || "（空）"}`,
    });

    const json = extractJson(result.text);
    if (!json.system_template || !json.user_template) {
      return jsonError(502, "502", "AI 返回不完整，请重试");
    }

    return jsonOk({
      system_template: String(json.system_template).trim(),
      user_template: String(json.user_template).trim(),
      notes: json.notes ? String(json.notes).trim() : "",
      model_id: modelId,
      usage: {
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
