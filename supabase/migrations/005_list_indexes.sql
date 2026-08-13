-- List/filter performance indexes for admin console

CREATE INDEX IF NOT EXISTS usage_logs_created_idx
  ON usage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS usage_logs_status_created_idx
  ON usage_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_logs_task_created_idx
  ON usage_logs (task_code, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_logs_request_id_idx
  ON usage_logs (request_id);

CREATE INDEX IF NOT EXISTS sites_status_created_idx
  ON sites (status, created_at DESC);

CREATE INDEX IF NOT EXISTS sites_code_idx
  ON sites (code);

CREATE INDEX IF NOT EXISTS accounts_status_created_idx
  ON accounts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS api_tokens_site_status_created_idx
  ON api_tokens (site_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS tasks_status_created_idx
  ON tasks (status, created_at DESC);

CREATE INDEX IF NOT EXISTS tasks_code_idx
  ON tasks (task_code);

CREATE INDEX IF NOT EXISTS prompt_templates_task_updated_idx
  ON prompt_templates (task_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS prompt_templates_active_idx
  ON prompt_templates (is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS model_catalog_enabled_created_idx
  ON model_catalog (enabled, created_at DESC);

CREATE INDEX IF NOT EXISTS balance_ledgers_type_created_idx
  ON balance_ledgers (type, created_at DESC);
