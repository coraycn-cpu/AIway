/**
 * AIway server-only client.
 * Spec: https://www.ryfs.cn/api/docs/business-integration
 * Env: AI_SCHEDULER_URL=https://www.ryfs.cn/api/v1
 *      AI_SCHEDULER_TOKEN=sk_xxx
 */

export type RunInput = {
  task: string;
  input?: Record<string, unknown>;
  trace_id?: string;
};

export type RawRunInput = {
  model_id: string;
  system?: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  image_urls?: string[];
  /** Optional extra fields (e.g. image_url) passed through for multimodal helpers */
  input?: Record<string, unknown>;
  trace_id?: string;
};

export type RunResult = {
  request_id: string;
  mode?: "task" | "raw";
  output_text: string;
  /** Parsed JSON when gateway could normalize model output */
  output_json?: unknown | null;
  output_format?: "json" | "text";
  prompt_scope?: "global" | "site" | "raw";
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
    model_id: string;
  };
  balance: number;
};

/** Strip ```json fences / surrounding prose and parse JSON flexibly. */
export function extractJsonText(raw: string): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

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

export type AccountResult = {
  site_code: string;
  site_name: string;
  status: string;
  balance: number;
  month_quota: number | null;
  month_used: number;
  month_remaining: number | null;
  modes?: {
    task_mode_enabled: boolean;
    raw_mode_enabled: boolean;
    site_raw_enabled: boolean;
    can_use_task: boolean;
    can_use_raw: boolean;
  };
};

export class AiwayError extends Error {
  status: number;
  code: string;
  body: unknown;

  constructor(status: number, body: any) {
    super(body?.error?.message || `Aiway HTTP ${status}`);
    this.name = "AiwayError";
    this.status = status;
    this.code = String(body?.error?.code || status);
    this.body = body;
  }
}

function env() {
  const base = process.env.AI_SCHEDULER_URL;
  const token = process.env.AI_SCHEDULER_TOKEN;
  if (!base || !token) {
    throw new Error("Missing AI_SCHEDULER_URL or AI_SCHEDULER_TOKEN");
  }
  return { base: base.replace(/\/$/, ""), token };
}

async function aiwayFetch(path: string, init: RequestInit = {}) {
  const { base, token } = env();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiwayError(res.status, data);
  return data;
}

export async function runTask(payload: RunInput): Promise<RunResult> {
  return aiwayFetch("/run", {
    method: "POST",
    body: JSON.stringify({
      mode: "task",
      task: payload.task,
      input: payload.input ?? {},
      trace_id: payload.trace_id,
    }),
  });
}

/**
 * Raw mode: business site owns model + prompts; AIway still authenticates and bills.
 * Requires admin: global raw_mode_enabled + site.raw_enabled.
 */
export async function runRaw(payload: RawRunInput): Promise<RunResult> {
  return aiwayFetch("/run", {
    method: "POST",
    body: JSON.stringify({
      mode: "raw",
      model_id: payload.model_id,
      system: payload.system ?? "",
      prompt: payload.prompt,
      temperature: payload.temperature,
      max_tokens: payload.max_tokens,
      image_urls: payload.image_urls,
      input: payload.input,
      trace_id: payload.trace_id,
    }),
  });
}

/** Prefer output_json; otherwise parse output_text (handles ```json fences). */
export async function runRawJson<T = unknown>(payload: RawRunInput): Promise<{
  data: T;
  request_id: string;
  usage: RunResult["usage"];
  balance: number;
}> {
  const raw = await runRaw(payload);

  if (raw.output_json != null && raw.output_format === "json") {
    return {
      data: raw.output_json as T,
      request_id: raw.request_id,
      usage: raw.usage,
      balance: raw.balance,
    };
  }

  const jsonText = extractJsonText(raw.output_text);
  if (!jsonText) {
    throw new Error(
      `output_text is not JSON (request_id=${raw.request_id}): ${String(raw.output_text).slice(0, 200)}`,
    );
  }

  return {
    data: JSON.parse(jsonText) as T,
    request_id: raw.request_id,
    usage: raw.usage,
    balance: raw.balance,
  };
}

/** For preset tasks that return JSON in output_text (handles ```json fences). */
export async function runTaskJson<T = unknown>(payload: RunInput): Promise<{
  data: T;
  request_id: string;
  usage: RunResult["usage"];
  balance: number;
  prompt_scope?: string;
}> {
  const raw = await runTask(payload);

  if (raw.output_json != null && raw.output_format === "json") {
    return {
      data: raw.output_json as T,
      request_id: raw.request_id,
      usage: raw.usage,
      balance: raw.balance,
      prompt_scope: raw.prompt_scope,
    };
  }

  const jsonText = extractJsonText(raw.output_text);
  if (!jsonText) {
    throw new Error(
      `output_text is not JSON (request_id=${raw.request_id}): ${String(raw.output_text).slice(0, 200)}`,
    );
  }

  return {
    data: JSON.parse(jsonText) as T,
    request_id: raw.request_id,
    usage: raw.usage,
    balance: raw.balance,
    prompt_scope: raw.prompt_scope,
  };
}

export async function getAccount(): Promise<AccountResult> {
  return aiwayFetch("/account");
}

export async function listUsage(query = "page=1&page_size=20") {
  return aiwayFetch(`/usage?${query}`);
}

export async function getUsage(requestId: string) {
  return aiwayFetch(`/usage/${encodeURIComponent(requestId)}`);
}

/** Convenience: apparel image enrich */
export function enrichApparelFromImage(input: {
  image_url: string;
  image_urls?: string[] | string;
  category_hint?: string;
  brand_voice?: string;
  known_specs?: string;
  trace_id?: string;
}) {
  const { trace_id, ...rest } = input;
  return runTaskJson({
    task: "apparel_image_enrich",
    input: rest,
    trace_id,
  });
}

/** Convenience: blog topic recommend */
export function recommendBlogTopics(input: {
  site_theme: string;
  target_audience: string;
  primary_market?: string;
  existing_topics?: string;
  count?: string | number;
  geo_focus?: string;
  trace_id?: string;
}) {
  const { trace_id, ...rest } = input;
  return runTaskJson({
    task: "blog_topic_recommend",
    input: {
      ...rest,
      count: rest.count != null ? String(rest.count) : undefined,
    },
    trace_id,
  });
}

/** Convenience: blog SEO article */
export function writeBlogSeoArticle(input: {
  site_theme: string;
  target_audience: string;
  topic_title: string;
  primary_keyword: string;
  secondary_keywords?: string;
  internal_link_map?: string;
  brand_name?: string;
  word_count?: string | number;
  cta?: string;
  trace_id?: string;
}) {
  const { trace_id, ...rest } = input;
  return runTaskJson({
    task: "blog_seo_article",
    input: {
      ...rest,
      word_count: rest.word_count != null ? String(rest.word_count) : undefined,
    },
    trace_id,
  });
}
