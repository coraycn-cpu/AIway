import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { BillingError } from "@/lib/billing";
import { PromptError } from "@/lib/prompts";
import { ModeForbiddenError } from "@/lib/settings";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return jsonError(err.status, String(err.status), err.message);
  }
  if (err instanceof BillingError) {
    return jsonError(err.status, err.code, err.message);
  }
  if (err instanceof PromptError) {
    return jsonError(err.status, String(err.status), err.message);
  }
  if (err instanceof ModeForbiddenError) {
    return jsonError(err.status, err.code, err.message);
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  if (
    message.includes("DATABASE_URL") ||
    message.includes("POSTGRES_URL") ||
    message.includes("ADMIN_SESSION_SECRET")
  ) {
    return jsonError(500, "500", "Server misconfigured: missing environment variables");
  }
  return jsonError(500, "500", message);
}
