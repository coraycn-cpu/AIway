import { getSql } from "@/lib/db";

export type ModeSettings = {
  raw_mode_enabled: boolean;
  task_mode_enabled: boolean;
};

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
      ('task_mode_enabled', 'true'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `;
}

export async function getModeSettings(): Promise<ModeSettings> {
  await ensureSettingsSchema();
  const sql = getSql();
  const rows = await sql<{ key: string; value: unknown }[]>`
    SELECT key, value FROM system_settings
    WHERE key IN ('raw_mode_enabled', 'task_mode_enabled')
  `;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    raw_mode_enabled: Boolean(map.get("raw_mode_enabled")),
    task_mode_enabled: map.get("task_mode_enabled") !== false,
  };
}

export async function setModeSettings(patch: Partial<ModeSettings>) {
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
  return getModeSettings();
}

export class ModeForbiddenError extends Error {
  status = 403;
  code = "403";
  constructor(message: string) {
    super(message);
  }
}
