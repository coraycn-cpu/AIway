import { authenticateBearer } from "@/lib/auth";
import { getMonthUsed } from "@/lib/billing";
import { handleApiError, jsonOk } from "@/lib/api/errors";
import { getModeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    const modes = await getModeSettings();
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
      modes: {
        task_mode_enabled: modes.task_mode_enabled,
        raw_mode_enabled: modes.raw_mode_enabled,
        site_raw_enabled: Boolean(auth.site.raw_enabled),
        can_use_task: modes.task_mode_enabled,
        can_use_raw: modes.raw_mode_enabled && Boolean(auth.site.raw_enabled),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
