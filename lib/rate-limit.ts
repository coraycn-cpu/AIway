/**
 * In-process token bucket per site. Soft limit for serverless (best-effort).
 * Default from system_settings.rate_limit_per_minute (usually 120).
 */

type Bucket = { tokens: number; updatedAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __aiwayRateBuckets: Map<string, Bucket> | undefined;
}

function buckets() {
  if (!global.__aiwayRateBuckets) global.__aiwayRateBuckets = new Map();
  return global.__aiwayRateBuckets;
}

export class RateLimitError extends Error {
  status = 429;
  code = "429";
  retryAfterSec: number;
  constructor(message: string, retryAfterSec = 1) {
    super(message);
    this.retryAfterSec = retryAfterSec;
  }
}

export function assertRateLimit(siteId: string, limitPerMinute: number) {
  const limit = Math.max(1, Math.floor(limitPerMinute || 120));
  const now = Date.now();
  const refillPerMs = limit / 60_000;
  const key = siteId;
  const current = buckets().get(key) || { tokens: limit, updatedAt: now };
  const elapsed = Math.max(0, now - current.updatedAt);
  const tokens = Math.min(limit, current.tokens + elapsed * refillPerMs);
  if (tokens < 1) {
    const retryAfterSec = Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000));
    buckets().set(key, { tokens, updatedAt: now });
    throw new RateLimitError(
      `Rate limit exceeded (${limit}/min). Retry after ${retryAfterSec}s`,
      retryAfterSec,
    );
  }
  buckets().set(key, { tokens: tokens - 1, updatedAt: now });
}
