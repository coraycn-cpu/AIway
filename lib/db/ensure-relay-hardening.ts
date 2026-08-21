import { getSql } from "@/lib/db";

declare global {
  // eslint-disable-next-line no-var
  var __aiwayRelayHardeningEnsured: boolean | undefined;
  // eslint-disable-next-line no-var
  var __aiwayRelayHardeningPromise: Promise<void> | undefined;
}

/**
 * Apply migration 006 pieces idempotently when prod forgot to run SQL.
 * Safe to call often; runs once per process after success.
 */
export async function ensureRelayHardeningSchema() {
  if (global.__aiwayRelayHardeningEnsured) return;
  if (!global.__aiwayRelayHardeningPromise) {
    global.__aiwayRelayHardeningPromise = (async () => {
      const sql = getSql();
      await sql.unsafe(`
        ALTER TABLE accounts
          ADD COLUMN IF NOT EXISTS held_balance NUMERIC(18, 6) NOT NULL DEFAULT 0;

        ALTER TABLE model_catalog
          ADD COLUMN IF NOT EXISTS min_cost_per_call NUMERIC(18, 6) NOT NULL DEFAULT 0;

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
      `);
      // Floor price for image models only when still zero
      await sql.unsafe(`
        UPDATE model_catalog
        SET min_cost_per_call = 0.03
        WHERE model_id LIKE '%image%'
          AND COALESCE(min_cost_per_call, 0) = 0;
      `);
      global.__aiwayRelayHardeningEnsured = true;
    })().catch((err) => {
      global.__aiwayRelayHardeningPromise = undefined;
      throw err;
    });
  }
  await global.__aiwayRelayHardeningPromise;
}
