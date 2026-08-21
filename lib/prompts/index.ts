import { getSql } from "@/lib/db";
import type { PromptTemplate, Task } from "@/lib/db/schema";
import { cacheDeletePrefix, cacheGetOrSet } from "@/lib/cache";
import {
  parseInputSchema,
  schemaToExampleInput,
  validateInputAgainstSchema,
  type InputFieldSchema,
} from "@/lib/prompts/schema";

export class PromptError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.status = status;
  }
}

export function renderTemplate(template: string, input: Record<string, unknown>) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = input[key];
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value);
  });
}

export function invalidatePromptCache(taskCode?: string) {
  if (taskCode) cacheDeletePrefix(`prompt:${taskCode}:`);
  else cacheDeletePrefix("prompt:");
}

export async function loadTaskAndPrompt(taskCode: string, siteId: string) {
  return cacheGetOrSet(`prompt:${taskCode}:${siteId}`, 30_000, async () => {
    const sql = getSql();
    const tasks = await sql<Task[]>`
      SELECT * FROM tasks WHERE task_code = ${taskCode} LIMIT 1
    `;
    const task = tasks[0];
    if (!task) {
      throw new PromptError(
        `Task not found: ${taskCode}. 若为预置能力，请管理员在 AIway 后台「任务」页点击「同步预置能力」。`,
        404,
      );
    }
    if (task.status !== "active") {
      throw new PromptError(`Task disabled: ${taskCode}`, 404);
    }

    const schema = parseInputSchema(task.input_schema);

    // Prefer site override, else global — one round-trip.
    const prompts = await sql<(PromptTemplate & { scope_rank: number })[]>`
      SELECT *,
        CASE WHEN site_id IS NOT NULL THEN 0 ELSE 1 END AS scope_rank
      FROM prompt_templates
      WHERE task_id = ${task.id}
        AND is_active = TRUE
        AND (site_id = ${siteId} OR site_id IS NULL)
      ORDER BY scope_rank ASC, version DESC
      LIMIT 1
    `;
    const prompt = prompts[0];
    if (!prompt) {
      throw new PromptError("Prompt template not found: 请先为该任务配置全局默认提示词", 404);
    }
    const scope = prompt.site_id ? ("site" as const) : ("global" as const);
    return { task, prompt, scope, schema };
  });
}

export function assertInputMatchesTaskSchema(
  schema: InputFieldSchema[],
  input: Record<string, unknown>,
) {
  const result = validateInputAgainstSchema(schema, input);
  if (!result.ok) {
    throw new PromptError(`缺少必填字段: ${result.missing.join(", ")}`, 400);
  }
}

export { parseInputSchema, schemaToExampleInput, validateInputAgainstSchema };
export type { InputFieldSchema };
