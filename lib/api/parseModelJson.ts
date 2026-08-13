/**
 * Flexibly extract a JSON value from model output that may include
 * markdown fences, leading prose, or trailing notes.
 */
export function extractJsonText(raw: string): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  // Direct JSON
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // continue
    }
  }

  // ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      // continue
    }
  }

  // First object / array span
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  let start = -1;
  let end = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    start = objStart;
    end = text.lastIndexOf("}");
  } else if (arrStart >= 0) {
    start = arrStart;
    end = text.lastIndexOf("]");
  }
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      return null;
    }
  }

  return null;
}

export function parseModelJson<T = unknown>(
  raw: string,
): { ok: true; value: T; jsonText: string } | { ok: false; error: string } {
  const jsonText = extractJsonText(raw);
  if (!jsonText) {
    return {
      ok: false,
      error: `output_text is not JSON: ${String(raw).slice(0, 180)}`,
    };
  }
  try {
    return { ok: true, value: JSON.parse(jsonText) as T, jsonText };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "JSON parse failed",
    };
  }
}
