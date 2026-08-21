import { getSql } from "@/lib/db";
import { cacheDeletePrefix, cacheGetOrSet } from "@/lib/cache";

export type ModeSettings = {
  raw_mode_enabled: boolean;
  task_mode_enabled: boolean;
  rate_limit_per_minute: number;
};

const SETTINGS_TTL_MS = 15_000;

/** Migration/bootstrap only — do not call on Open API hot path. */
export async function ensureSettingsSchema() {
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT 'null'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await sql.unsafe(
    `ALTER TABLE sites ADD COLUMN IF NOT EXISTS raw_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await sql`
    INSERT INTO system_settings (key, value)
    VALUES
      ('raw_mode_enabled', 'false'::jsonb),
      ('task_mode_enabled', 'true'::jsonb),
      ('rate_limit_per_minute', '120'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `;
}

async function loadModeSettings(): Promise<ModeSettings> {
  const sql = getSql();
  const rows = await sql<{ key: string; value: unknown }[]>`
    SELECT key, value FROM system_settings
    WHERE key IN ('raw_mode_enabled', 'task_mode_enabled', 'rate_limit_per_minute')
  `;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rateRaw = map.get("rate_limit_per_minute");
  const rate =
    typeof rateRaw === "number"
      ? rateRaw
      : typeof rateRaw === "string"
        ? Number(rateRaw)
        : 120;
  return {
    raw_mode_enabled: Boolean(map.get("raw_mode_enabled")),
    task_mode_enabled: map.get("task_mode_enabled") !== false,
    rate_limit_per_minute:
      Number.isFinite(rate) && rate > 0 ? Math.min(Math.floor(rate), 6000) : 120,
  };
}

export async function getModeSettings(): Promise<ModeSettings> {
  return cacheGetOrSet("settings:modes", SETTINGS_TTL_MS, loadModeSettings);
}

export async function setModeSettings(
  patch: Partial<Pick<ModeSettings, "raw_mode_enabled" | "task_mode_enabled" | "rate_limit_per_minute">>,
) {
  await ensureSettingsSchema();
  const sql = getSql();
  if (patch.raw_mode_enabled !== undefined) {
    await sql`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('raw_mode_enabled', ${sql.json(patch.raw_mode_enabled)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  if (patch.task_mode_enabled !== undefined) {
    await sql`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('task_mode_enabled', ${sql.json(patch.task_mode_enabled)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  if (patch.rate_limit_per_minute !== undefined) {
    await sql`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('rate_limit_per_minute', ${sql.json(patch.rate_limit_per_minute)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  cacheDeletePrefix("settings:");
  return getModeSettings();
}

export class ModeForbiddenError extends Error {
  status = 403;
  code = "403";
  constructor(message: string) {
    super(message);
  }
}
