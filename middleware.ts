import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/dashboard") &&
      !pathname.startsWith("/sites") &&
      !pathname.startsWith("/accounts") &&
      !pathname.startsWith("/tokens") &&
      !pathname.startsWith("/tasks") &&
      !pathname.startsWith("/prompts") &&
      !pathname.startsWith("/models") &&
      !pathname.startsWith("/logs") &&
      !pathname.startsWith("/docs")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("aiway_admin_session")?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!token || !secret) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sites/:path*",
    "/accounts/:path*",
    "/tokens/:path*",
    "/tasks/:path*",
    "/prompts/:path*",
    "/models/:path*",
    "/logs/:path*",
    "/docs/:path*",
  ],
};
