import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdmin();
    return jsonOk({ email: admin.email, id: admin.id });
  } catch (err) {
    return handleApiError(err);
  }
}
