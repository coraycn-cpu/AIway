import { z } from "zod";
import { createAdminSession, verifyPassword } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid credentials payload");

    const sql = getSql();
    const rows = await sql<{ id: string; email: string; password_hash: string }[]>`
      SELECT id, email, password_hash FROM admin_users WHERE email = ${body.data.email.toLowerCase()} LIMIT 1
    `;
    const admin = rows[0];
    if (!admin || !(await verifyPassword(body.data.password, admin.password_hash))) {
      return jsonError(401, "401", "Invalid email or password");
    }

    await createAdminSession(admin);
    return jsonOk({ ok: true, email: admin.email });
  } catch (err) {
    return handleApiError(err);
  }
}
