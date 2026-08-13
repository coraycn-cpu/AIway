import { authenticateBearer } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ request_id: string }> },
) {
  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    const { request_id } = await ctx.params;
    const sql = getSql();
    const rows = await sql<
      {
        request_id: string;
        task_code: string | null;
        model_id: string | null;
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        cost: string;
        status: string;
        error_code: string | null;
        error_message: string | null;
        trace_id: string | null;
        latency_ms: number | null;
        created_at: Date;
      }[]
    >`
      SELECT request_id, task_code, model_id, input_tokens, output_tokens, total_tokens,
             cost::text, status, error_code, error_message, trace_id, latency_ms, created_at
      FROM usage_logs
      WHERE request_id = ${request_id} AND account_id = ${auth.account.id}
      LIMIT 1
    `;
    if (!rows[0]) return jsonError(404, "404", "Usage record not found");
    const r = rows[0];
    return jsonOk({
      request_id: r.request_id,
      task: r.task_code,
      model_id: r.model_id,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      total_tokens: r.total_tokens,
      cost: Number(r.cost),
      status: r.status,
      error_code: r.error_code,
      error_message: r.error_message,
      trace_id: r.trace_id,
      latency_ms: r.latency_ms,
      created_at: r.created_at,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
