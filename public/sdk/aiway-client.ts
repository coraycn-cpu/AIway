/**
 * AIway business-site client (copy into your server-only code).
 *
 * Env (server only):
 *   AI_SCHEDULER_URL=https://<aiway-host>/api/v1
 *   AI_SCHEDULER_TOKEN=sk_xxx
 *
 * Usage:
 *   import { runTaskJson, getAccount } from "./aiway-client";
 *   const { data } = await runTaskJson({ task: "ping", input: { message: "hi" } });
 */

export type RunInput = {
  task: string;
  input?: Record<string, unknown>;
  trace_id?: string;
};

export type RunResult = {
  request_id: string;
  output_text: string;
  prompt_scope?: "global" | "site";
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
    model_id: string;
  };
  balance: number;
};

export type AccountResult = {
  site_code: string;
  site_name: string;
  status: string;
  balance: number;
  month_quota: number | null;
  month_used: number;
  month_remaining: number | null;
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
      task: payload.task,
      input: payload.input ?? {},
      trace_id: payload.trace_id,
    }),
  });
}

/** For preset tasks that return JSON in output_text. */
export async function runTaskJson<T = unknown>(payload: RunInput): Promise<{
  data: T;
  request_id: string;
  usage: RunResult["usage"];
  balance: number;
  prompt_scope?: string;
}> {
  const raw = await runTask(payload);
  let parsed: T;
  try {
    parsed = JSON.parse(raw.output_text) as T;
  } catch {
    throw new Error(
      `output_text is not JSON (request_id=${raw.request_id}): ${String(raw.output_text).slice(0, 200)}`,
    );
  }
  return {
    data: parsed,
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
