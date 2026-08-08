import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";
import { renderTemplate } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = z
      .object({
        system_template: z.string().default(""),
        user_template: z.string().min(1),
        input: z.record(z.string(), z.unknown()).default({}),
      })
      .safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError(400, "400", "Invalid preview payload");

    return jsonOk({
      system: renderTemplate(body.data.system_template, body.data.input),
      user: renderTemplate(body.data.user_template, body.data.input),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
