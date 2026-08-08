import { getSql } from "@/lib/db";
import type { PromptTemplate, Task } from "@/lib/db/schema";

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

  const sitePrompt = await sql<PromptTemplate[]>`
    SELECT * FROM prompt_templates
    WHERE task_id = ${task.id} AND site_id = ${siteId} AND is_active = TRUE
    ORDER BY version DESC
    LIMIT 1
  `;
  if (sitePrompt[0]) {
    return { task, prompt: sitePrompt[0], scope: "site" as const };
  }

  const globalPrompt = await sql<PromptTemplate[]>`
    SELECT * FROM prompt_templates
    WHERE task_id = ${task.id} AND site_id IS NULL AND is_active = TRUE
    ORDER BY version DESC
    LIMIT 1
  `;
  if (!globalPrompt[0]) {
    throw new PromptError("Prompt template not found", 404);
  }
  return { task, prompt: globalPrompt[0], scope: "global" as const };
}
