import { authenticateBearer } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateBearer(req.headers.get("authorization"));
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 20)));
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const task = url.searchParams.get("task");
    const offset = (page - 1) * pageSize;

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
        created_at: Date;
      }[]
    >`
      SELECT request_id, task_code, model_id, input_tokens, output_tokens, total_tokens,
             cost::text, status, created_at
      FROM usage_logs
      WHERE account_id = ${auth.account.id}
        AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        AND (${task}::text IS NULL OR task_code = ${task})
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const summaryRows = await sql<
      { total_calls: string; total_cost: string; total_tokens: string }[]
    >`
      SELECT COUNT(*)::text AS total_calls,
             COALESCE(SUM(cost), 0)::text AS total_cost,
             COALESCE(SUM(total_tokens), 0)::text AS total_tokens
      FROM usage_logs
      WHERE account_id = ${auth.account.id}
        AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        AND (${task}::text IS NULL OR task_code = ${task})
    `;

    return jsonOk({
      page,
      page_size: pageSize,
      items: rows.map((r) => ({
        request_id: r.request_id,
        task: r.task_code,
        model_id: r.model_id,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        total_tokens: r.total_tokens,
        cost: Number(r.cost),
        status: r.status,
        created_at: r.created_at,
      })),
      summary: {
        total_calls: Number(summaryRows[0]?.total_calls ?? 0),
        total_cost: Number(summaryRows[0]?.total_cost ?? 0),
        total_tokens: Number(summaryRows[0]?.total_tokens ?? 0),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
