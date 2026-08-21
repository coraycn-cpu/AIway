import { getSql } from "@/lib/db";
import { ensureRelayHardeningSchema } from "@/lib/db/ensure-relay-hardening";

export type IdempotentHit = {
  request_id: string;
  response_status: number;
  response_body: unknown;
};

export async function findIdempotentResponse(
  siteId: string,
  idemKey: string,
): Promise<IdempotentHit | null> {
  await ensureRelayHardeningSchema();
  const key = idemKey.trim().slice(0, 200);
  if (!key) return null;
  const sql = getSql();
  const rows = await sql<
    { request_id: string; response_status: number | null; response_body: unknown; status: string }[]
  >`
    SELECT request_id, response_status, response_body, status
    FROM idempotency_keys
    WHERE site_id = ${siteId} AND idem_key = ${key}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.status !== "success" || row.response_status == null) return null;
  return {
    request_id: row.request_id,
    response_status: row.response_status,
    response_body: row.response_body,
  };
}

export async function saveIdempotentResponse(opts: {
  siteId: string;
  idemKey: string;
  requestId: string;
  responseStatus: number;
  responseBody: unknown;
}) {
  const key = opts.idemKey.trim().slice(0, 200);
  if (!key) return;
  const sql = getSql();
  await sql`
    INSERT INTO idempotency_keys (
      site_id, idem_key, request_id, status, response_status, response_body
    ) VALUES (
      ${opts.siteId}, ${key}, ${opts.requestId}, 'success',
      ${opts.responseStatus}, ${sql.json(opts.responseBody as never)}
    )
    ON CONFLICT (site_id, idem_key) DO UPDATE SET
      request_id = EXCLUDED.request_id,
      status = 'success',
      response_status = EXCLUDED.response_status,
      response_body = EXCLUDED.response_body
  `;
}

export function readIdempotencyKey(req: Request): string | null {
  const raw =
    req.headers.get("idempotency-key") ||
    req.headers.get("Idempotency-Key") ||
    "";
  const key = raw.trim();
  return key ? key.slice(0, 200) : null;
}
