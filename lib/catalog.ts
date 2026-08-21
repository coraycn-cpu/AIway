import { getSql } from "@/lib/db";
import { cacheDeletePrefix, cacheGetOrSet } from "@/lib/cache";
import { ensureRelayHardeningSchema } from "@/lib/db/ensure-relay-hardening";

export type CatalogModel = {
  model_id: string;
  display_name?: string;
  input_price_per_1m: string;
  output_price_per_1m: string;
  min_cost_per_call: string;
  enabled: boolean;
};

const CATALOG_TTL_MS = 30_000;

export function invalidateCatalogCache() {
  cacheDeletePrefix("catalog:");
}

export async function listEnabledCatalogModels(): Promise<CatalogModel[]> {
  await ensureRelayHardeningSchema();
  return cacheGetOrSet("catalog:enabled", CATALOG_TTL_MS, async () => {
    const sql = getSql();
    const rows = await sql<CatalogModel[]>`
      SELECT
        model_id,
        display_name,
        input_price_per_1m::text,
        output_price_per_1m::text,
        COALESCE(min_cost_per_call, 0)::text AS min_cost_per_call,
        enabled
      FROM model_catalog
      WHERE enabled = TRUE
      ORDER BY model_id
    `;
    return rows;
  });
}

export async function resolveCatalogModel(requested: string): Promise<CatalogModel | null> {
  const id = requested.trim();
  if (!id) return null;
  const models = await listEnabledCatalogModels();
  const exact = models.find((m) => m.model_id === id);
  if (exact) return exact;
  const prefixed = [
    `google/${id}`,
    `openai/${id}`,
    `deepseek/${id}`,
    `anthropic/${id}`,
    `bfl/${id}`,
    `xai/${id}`,
  ];
  for (const candidate of prefixed) {
    const hit = models.find((m) => m.model_id === candidate);
    if (hit) return hit;
  }
  return (
    models.find((m) => {
      const slash = m.model_id.indexOf("/");
      return slash >= 0 && m.model_id.slice(slash + 1) === id;
    }) || null
  );
}
