import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { getModeSettings, setModeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getModeSettings();
    return jsonOk({
      ...settings,
      tip: "全局开关 + 站点 raw_enabled 同时开启后，业务站才能调 mode=raw。",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        raw_mode_enabled: z.boolean().optional(),
        task_mode_enabled: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid settings payload");
    if (
      body.data.raw_mode_enabled === undefined &&
      body.data.task_mode_enabled === undefined
    ) {
      return jsonError(400, "400", "No settings to update");
    }
    const settings = await setModeSettings(body.data);
    return jsonOk({
      ...settings,
      tip: "设置已保存。站点还需单独打开 raw_enabled 才能用 raw 模式。",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
