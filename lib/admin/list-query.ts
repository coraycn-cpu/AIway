import { getSql } from "@/lib/db";

export type ListQuery = {
  page: number;
  pageSize: number;
  offset: number;
  q: string | null;
  status: string | null;
};

export function parseListQuery(
  url: URL,
  defaults?: { pageSize?: number; maxPageSize?: number },
): ListQuery {
  const max = defaults?.maxPageSize ?? 100;
  const defSize = defaults?.pageSize ?? 20;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(
    max,
    Math.max(1, Number(url.searchParams.get("page_size") || defSize)),
  );
  const qRaw = (url.searchParams.get("q") || "").trim();
  const statusRaw = (url.searchParams.get("status") || "").trim();
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    q: qRaw || null,
    status: statusRaw || null,
  };
}

export function emptyToNull(value: string | null | undefined) {
  const v = (value || "").trim();
  return v ? v : null;
}

export function listMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
  };
}

let indexesPromise: Promise<void> | null = null;

/** Create list/filter indexes once per process (IF NOT EXISTS). */
export function ensureListIndexes() {
  if (!indexesPromise) {
    indexesPromise = (async () => {
      const sql = getSql();
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS usage_logs_created_idx ON usage_logs (created_at DESC);
        CREATE INDEX IF NOT EXISTS usage_logs_status_created_idx ON usage_logs (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS usage_logs_task_created_idx ON usage_logs (task_code, created_at DESC);
        CREATE INDEX IF NOT EXISTS usage_logs_request_id_idx ON usage_logs (request_id);
        CREATE INDEX IF NOT EXISTS sites_status_created_idx ON sites (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS sites_code_idx ON sites (code);
        CREATE INDEX IF NOT EXISTS accounts_status_created_idx ON accounts (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS api_tokens_site_status_created_idx ON api_tokens (site_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS tasks_status_created_idx ON tasks (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS tasks_code_idx ON tasks (task_code);
        CREATE INDEX IF NOT EXISTS prompt_templates_task_updated_idx ON prompt_templates (task_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS prompt_templates_active_idx ON prompt_templates (is_active, updated_at DESC);
        CREATE INDEX IF NOT EXISTS model_catalog_enabled_created_idx ON model_catalog (enabled, created_at DESC);
        CREATE INDEX IF NOT EXISTS balance_ledgers_type_created_idx ON balance_ledgers (type, created_at DESC);
      `);
    })().catch((err) => {
      indexesPromise = null;
      console.error("ensureListIndexes failed", err);
    });
  }
  return indexesPromise;
}
