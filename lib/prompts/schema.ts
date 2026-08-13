export type InputFieldSchema = {
  key: string;
  label?: string;
  required?: boolean;
  example?: string;
};

export function parseInputSchema(raw: unknown): InputFieldSchema[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      return parseInputSchema(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const out: InputFieldSchema[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || !row.key.trim()) continue;
    out.push({
      key: row.key.trim(),
      label: typeof row.label === "string" ? row.label : row.key,
      required: Boolean(row.required),
      example: typeof row.example === "string" ? row.example : "",
    });
  }
  return out;
}

export function validateInputAgainstSchema(
  schema: InputFieldSchema[],
  input: Record<string, unknown>,
) {
  const missing = schema
    .filter((f) => f.required)
    .filter((f) => {
      const v = input[f.key];
      return v == null || v === "";
    })
    .map((f) => f.key);
  return { ok: missing.length === 0, missing };
}

export function schemaToExampleInput(schema: InputFieldSchema[]) {
  const out: Record<string, string> = {};
  for (const f of schema) {
    out[f.key] = f.example || (f.required ? `<${f.key}>` : "");
  }
  return out;
}
