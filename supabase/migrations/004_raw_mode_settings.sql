-- Dual mode: raw prompt calls controlled by global + per-site switches

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value)
VALUES
  ('raw_mode_enabled', 'false'::jsonb),
  ('task_mode_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS raw_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN sites.raw_enabled IS
  'Allow this site to call /run in raw mode (self-provided prompts). Requires global raw_mode_enabled=true.';
