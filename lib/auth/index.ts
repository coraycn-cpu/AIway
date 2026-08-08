import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSql } from "@/lib/db";
import type { Account, AdminUser, ApiToken, Site } from "@/lib/db/schema";

const SESSION_COOKIE = "aiway_admin_session";
const SESSION_TTL = "7d";

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createAdminSession(admin: Pick<AdminUser, "id" | "email">) {
  const token = await new SignJWT({ email: admin.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(sessionSecret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getAdminSession(): Promise<{ id: string; email: string } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken() {
  const raw = `sk_${randomBytes(24).toString("hex")}`;
  return {
    token: raw,
    prefix: raw.slice(0, 10),
    hash: hashApiToken(raw),
  };
}

export type AuthContext = {
  site: Site;
  account: Account;
  token: ApiToken;
};

export async function authenticateBearer(authHeader: string | null): Promise<AuthContext> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new AuthError("Missing token", 401);

  const sql = getSql();
  const hash = hashApiToken(token);
  const rows = await sql<
    {
      token_id: string;
      token_status: ApiToken["status"];
      token_prefix: string;
      token_name: string | null;
      token_last_used_at: Date | null;
      token_created_at: Date;
      site_id: string;
      site_code: string;
      site_name: string;
      site_status: Site["status"];
      site_created_at: Date;
      site_updated_at: Date;
      account_id: string;
      balance: string;
      month_quota: string | null;
      account_status: Account["status"];
      account_created_at: Date;
      account_updated_at: Date;
    }[]
  >`
    SELECT
      t.id AS token_id,
      t.status AS token_status,
      t.prefix AS token_prefix,
      t.name AS token_name,
      t.last_used_at AS token_last_used_at,
      t.created_at AS token_created_at,
      s.id AS site_id,
      s.code AS site_code,
      s.name AS site_name,
      s.status AS site_status,
      s.created_at AS site_created_at,
      s.updated_at AS site_updated_at,
      a.id AS account_id,
      a.balance::text AS balance,
      a.month_quota::text AS month_quota,
      a.status AS account_status,
      a.created_at AS account_created_at,
      a.updated_at AS account_updated_at
    FROM api_tokens t
    JOIN sites s ON s.id = t.site_id
    JOIN accounts a ON a.id = t.account_id
    WHERE t.token_hash = ${hash}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row || row.token_status !== "active") {
    throw new AuthError("Invalid token", 401);
  }
  if (row.site_status !== "active" || row.account_status !== "active") {
    throw new AuthError("Account or site disabled", 403);
  }

  await sql`UPDATE api_tokens SET last_used_at = NOW() WHERE id = ${row.token_id}`;

  return {
    site: {
      id: row.site_id,
      code: row.site_code,
      name: row.site_name,
      status: row.site_status,
      created_at: row.site_created_at,
      updated_at: row.site_updated_at,
    },
    account: {
      id: row.account_id,
      site_id: row.site_id,
      balance: row.balance,
      month_quota: row.month_quota,
      status: row.account_status,
      created_at: row.account_created_at,
      updated_at: row.account_updated_at,
    },
    token: {
      id: row.token_id,
      site_id: row.site_id,
      account_id: row.account_id,
      token_hash: hash,
      prefix: row.token_prefix,
      name: row.token_name,
      status: row.token_status,
      last_used_at: row.token_last_used_at,
      created_at: row.token_created_at,
    },
  };
}
