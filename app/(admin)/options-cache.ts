/**
 * Short-lived client caches for admin dropdown options (sites/tasks/accounts).
 * Avoids re-fetching the same option lists on every page mount within a session.
 */

type CacheEntry<T> = { at: number; items: T[] };

const TTL_MS = 45_000;
const store = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(key: string, url: string): Promise<T[]> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Failed to load ${key}`);
  const items = (data.items || []) as T[];
  store.set(key, { at: Date.now(), items });
  return items;
}

export function invalidateAdminOptions(keys?: string[]) {
  if (!keys?.length) {
    store.clear();
    return;
  }
  for (const k of keys) store.delete(k);
}

export type SiteOption = { id: string; code: string; name: string; status?: string };
export type TaskOption = {
  id: string;
  task_code: string;
  name: string;
  has_global_prompt?: boolean;
  input_schema?: Array<{ key: string; required?: boolean; label?: string; example?: string }>;
};
export type AccountOption = {
  id: string;
  site_id: string;
  site_code: string;
  site_name: string;
  balance: string;
  month_quota?: string | null;
  status: string;
};
export type ModelOption = { model_id: string; display_name: string; enabled?: boolean };

export function fetchSiteOptions() {
  return cachedFetch<SiteOption>("sites", "/api/admin/sites?page=1&page_size=200");
}

export function fetchTaskOptions() {
  return cachedFetch<TaskOption>("tasks", "/api/admin/tasks?page=1&page_size=200");
}

export function fetchAccountOptions() {
  return cachedFetch<AccountOption>("accounts", "/api/admin/accounts?page=1&page_size=200");
}

export function fetchModelOptions() {
  return cachedFetch<ModelOption>(
    "models",
    "/api/admin/models?page=1&page_size=200&enabled=true",
  );
}
