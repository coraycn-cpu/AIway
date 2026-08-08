import { authenticateBearer } from "@/lib/auth";
import { getMonthUsed } from "@/lib/billing";
import { handleApiError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    const balance = Number(auth.account.balance);
    const monthQuota = auth.account.month_quota != null ? Number(auth.account.month_quota) : null;
    const monthUsed = await getMonthUsed(auth.account.id);
    const monthRemaining = monthQuota == null ? null : Math.max(0, monthQuota - monthUsed);

    return jsonOk({
      site_code: auth.site.code,
      site_name: auth.site.name,
      status: auth.account.status,
      balance,
      month_quota: monthQuota,
      month_used: monthUsed,
      month_remaining: monthRemaining,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
