import { z } from "zod";
import { generateApiToken, requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { emptyToNull, ensureListIndexes, listMeta, parseListQuery } from "@/lib/admin/list-query";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    await ensureListIndexes();
    const url = new URL(req.url);
    const { page, pageSize, offset, q, status } = parseListQuery(url, { pageSize: 20 });
    const siteId = emptyToNull(url.searchParams.get("site_id"));

    const sql = getSql();
    const countPromise = sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total
      FROM api_tokens t
      JOIN sites s ON s.id = t.site_id
      WHERE (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
        AND (${status}::text IS NULL OR t.status = ${status})
        AND (
          ${q}::text IS NULL
          OR t.prefix ILIKE '%' || ${q} || '%'
          OR COALESCE(t.name, '') ILIKE '%' || ${q} || '%'
          OR s.code ILIKE '%' || ${q} || '%'
        )
    `;
    const rowsPromise = sql`
      SELECT t.id, t.site_id, t.account_id, t.prefix, t.name, t.status, t.last_used_at, t.created_at,
             s.code AS site_code
      FROM api_tokens t
      JOIN sites s ON s.id = t.site_id
      WHERE (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
        AND (${status}::text IS NULL OR t.status = ${status})
        AND (
          ${q}::text IS NULL
          OR t.prefix ILIKE '%' || ${q} || '%'
          OR COALESCE(t.name, '') ILIKE '%' || ${q} || '%'
          OR s.code ILIKE '%' || ${q} || '%'
        )
      ORDER BY t.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    const [countRows, rows] = await Promise.all([countPromise, rowsPromise]);
    return jsonOk({
      items: rows,
      ...listMeta(page, pageSize, Number(countRows[0]?.total ?? 0)),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        site_id: z.string().uuid(),
        name: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid token payload");

    const sql = getSql();
    const accounts = await sql<{ id: string }[]>`
      SELECT id FROM accounts WHERE site_id = ${body.data.site_id} LIMIT 1
    `;
    if (!accounts[0]) return jsonError(404, "404", "Account not found for site");

    const generated = generateApiToken();
    const rows = await sql<{ id: string; prefix: string }[]>`
      INSERT INTO api_tokens (site_id, account_id, token_hash, prefix, name)
      VALUES (${body.data.site_id}, ${accounts[0].id}, ${generated.hash}, ${generated.prefix}, ${body.data.name ?? null})
      RETURNING id, prefix
    `;

    return jsonOk(
      {
        id: rows[0].id,
        prefix: rows[0].prefix,
        token: generated.token,
        warning: "Token plaintext is shown only once. Store it in the site server env.",
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "revoked"]),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid token patch");

    const sql = getSql();
    await sql`UPDATE api_tokens SET status = ${body.data.status} WHERE id = ${body.data.id}`;
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
