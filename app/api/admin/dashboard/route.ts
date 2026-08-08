import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const sql = getSql();

    const [calls, spend, failures, lowBalance, recent] = await Promise.all([
      sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM usage_logs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `,
      sql<{ total: string }[]>`
        SELECT COALESCE(SUM(cost), 0)::text AS total FROM usage_logs
        WHERE status = 'success' AND created_at >= NOW() - INTERVAL '24 hours'
      `,
      sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM usage_logs
        WHERE status IN ('error', 'rejected') AND created_at >= NOW() - INTERVAL '24 hours'
      `,
      sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM accounts WHERE balance < 1 AND status = 'active'
      `,
      sql`
        SELECT u.request_id, u.task_code, u.cost::text, u.status, u.created_at, s.code AS site_code
        FROM usage_logs u
        JOIN sites s ON s.id = u.site_id
        ORDER BY u.created_at DESC
        LIMIT 10
      `,
    ]);

    const callCount = Number(calls[0]?.count ?? 0);
    const failCount = Number(failures[0]?.count ?? 0);

    return jsonOk({
      last_24h_calls: callCount,
      last_24h_spend: Number(spend[0]?.total ?? 0),
      failure_rate: callCount === 0 ? 0 : failCount / callCount,
      low_balance_accounts: Number(lowBalance[0]?.count ?? 0),
      recent,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
