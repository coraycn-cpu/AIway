-- Relay hardening: holds, idempotency, image floor price, rate-limit setting

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS held_balance NUMERIC(18, 6) NOT NULL DEFAULT 0;

ALTER TABLE model_catalog
  ADD COLUMN IF NOT EXISTS min_cost_per_call NUMERIC(18, 6) NOT NULL DEFAULT 0;

UPDATE model_catalog
SET min_cost_per_call = 0.03
WHERE model_id LIKE '%image%'
  AND COALESCE(min_cost_per_call, 0) = 0;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  idem_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, idem_key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx
  ON idempotency_keys (created_at DESC);

INSERT INTO system_settings (key, value)
VALUES ('rate_limit_per_minute', '120'::jsonb)
ON CONFLICT (key) DO NOTHING;
