-- AI Scheduler V1 schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
  balance NUMERIC(18, 6) NOT NULL DEFAULT 0,
  month_quota NUMERIC(18, 6),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_model_id TEXT NOT NULL,
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 2048,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  system_template TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_global_active_uidx
  ON prompt_templates (task_id)
  WHERE site_id IS NULL AND is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_site_active_uidx
  ON prompt_templates (task_id, site_id)
  WHERE site_id IS NOT NULL AND is_active = TRUE;

CREATE TABLE IF NOT EXISTS model_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  input_price_per_1m NUMERIC(18, 6) NOT NULL DEFAULT 0,
  output_price_per_1m NUMERIC(18, 6) NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  site_id UUID NOT NULL REFERENCES sites(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  task_id UUID REFERENCES tasks(id),
  task_code TEXT,
  model_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost NUMERIC(18, 6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rejected')),
  error_code TEXT,
  error_message TEXT,
  trace_id TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_logs_site_created_idx ON usage_logs (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_logs_account_created_idx ON usage_logs (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS balance_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id),
  type TEXT NOT NULL CHECK (type IN ('recharge', 'charge', 'adjust')),
  amount NUMERIC(18, 6) NOT NULL,
  balance_after NUMERIC(18, 6) NOT NULL,
  usage_log_id UUID REFERENCES usage_logs(id),
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS balance_ledgers_account_created_idx ON balance_ledgers (account_id, created_at DESC);

-- Seed admin: admin@qq.com / 123456
INSERT INTO admin_users (email, password_hash, name)
VALUES (
  'admin@qq.com',
  '$2b$10$QInKuPYU01IjPdRmu1qu1uo9Kfi09JRihpID0pIkz.m1xsv6qmp7u',
  'Admin'
)
ON CONFLICT (email) DO NOTHING;

-- Default models
INSERT INTO model_catalog (model_id, display_name, input_price_per_1m, output_price_per_1m, enabled)
VALUES
  ('openai/gpt-4o-mini', 'GPT-4o Mini', 0.15, 0.60, TRUE),
  ('openai/gpt-4o', 'GPT-4o', 2.50, 10.00, TRUE),
  ('anthropic/claude-sonnet-4', 'Claude Sonnet 4', 3.00, 15.00, TRUE),
  ('deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash', 0.05, 0.10, TRUE),
  ('deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro', 0.40, 1.20, TRUE),
  ('deepseek/deepseek-v3.2', 'DeepSeek V3.2', 0.28, 0.42, TRUE),
  ('deepseek/deepseek-r1', 'DeepSeek R1', 0.55, 2.19, TRUE),
  ('google/gemini-2.0-flash', 'Gemini 2.0 Flash', 0.10, 0.40, TRUE),
  ('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 0.30, 2.50, TRUE),
  ('google/gemini-2.5-pro', 'Gemini 2.5 Pro', 1.25, 10.00, TRUE),
  ('google/gemini-3-flash', 'Gemini 3 Flash', 0.50, 3.00, TRUE),
  ('google/gemini-3.5-flash', 'Gemini 3.5 Flash', 0.50, 3.00, TRUE)
ON CONFLICT (model_id) DO NOTHING;

-- Demo task: ping
INSERT INTO tasks (task_code, name, default_model_id, temperature, max_tokens, status)
VALUES ('ping', 'Ping Test', 'openai/gpt-4o-mini', 0.2, 256, 'active')
ON CONFLICT (task_code) DO NOTHING;

INSERT INTO prompt_templates (task_id, site_id, system_template, user_template, version, is_active)
SELECT t.id, NULL, 'You are a health-check assistant. Reply briefly.',
       'User says: {{message}}. Reply with PONG and echo the message.',
       1, TRUE
FROM tasks t
WHERE t.task_code = 'ping'
  AND NOT EXISTS (
    SELECT 1 FROM prompt_templates p WHERE p.task_id = t.id AND p.site_id IS NULL AND p.is_active = TRUE
  );
