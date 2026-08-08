import { getSql } from "@/lib/db";
import type { PromptTemplate, Task } from "@/lib/db/schema";
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

export async function loadTaskAndPrompt(taskCode: string, siteId: string) {
  const sql = getSql();
  const tasks = await sql<Task[]>`
    SELECT * FROM tasks WHERE task_code = ${taskCode} LIMIT 1
  `;
  const task = tasks[0];
  if (!task || task.status !== "active") {
    throw new PromptError("Task not found or disabled", 404);
  }

  const schema = parseInputSchema(task.input_schema);

  const sitePrompt = await sql<PromptTemplate[]>`
    SELECT * FROM prompt_templates
    WHERE task_id = ${task.id} AND site_id = ${siteId} AND is_active = TRUE
    ORDER BY version DESC
    LIMIT 1
  `;
  if (sitePrompt[0]) {
    return { task, prompt: sitePrompt[0], scope: "site" as const, schema };
  }

  const globalPrompt = await sql<PromptTemplate[]>`
    SELECT * FROM prompt_templates
    WHERE task_id = ${task.id} AND site_id IS NULL AND is_active = TRUE
    ORDER BY version DESC
    LIMIT 1
  `;
  if (!globalPrompt[0]) {
    throw new PromptError("Prompt template not found: 请先为该任务配置全局默认提示词", 404);
  }
  return { task, prompt: globalPrompt[0], scope: "global" as const, schema };
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
