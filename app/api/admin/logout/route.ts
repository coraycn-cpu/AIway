import { clearAdminSession } from "@/lib/auth";
import { jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearAdminSession();
  return jsonOk({ ok: true });
}
