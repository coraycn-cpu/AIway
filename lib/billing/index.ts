import { getSql } from "@/lib/db";

export class BillingError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "402", status = 402) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function getMonthUsed(accountId: string) {
  const sql = getSql();
  const rows = await sql<{ month_used: string }[]>`
    SELECT COALESCE(SUM(cost), 0)::text AS month_used
    FROM usage_logs
    WHERE account_id = ${accountId}
      AND status = 'success'
      AND created_at >= date_trunc('month', NOW())
  `;
  return Number(rows[0]?.month_used ?? 0);
}

export async function assertCanSpend(accountId: string, estimatedCost = 0) {
  const sql = getSql();
  const rows = await sql<{ balance: string; month_quota: string | null; status: string }[]>`
    SELECT balance::text, month_quota::text, status
    FROM accounts
    WHERE id = ${accountId}
    LIMIT 1
  `;
  const account = rows[0];
  if (!account || account.status !== "active") {
    throw new BillingError("Account disabled", "403", 403);
  }
  const balance = Number(account.balance);
  if (balance <= 0 || balance < estimatedCost) {
    throw new BillingError("Insufficient balance", "402", 402);
  }
  if (account.month_quota != null) {
    const used = await getMonthUsed(accountId);
    const remaining = Number(account.month_quota) - used;
    if (remaining <= 0 || remaining < estimatedCost) {
      throw new BillingError("Monthly quota exceeded", "402", 402);
    }
  }
  return { balance, month_quota: account.month_quota };
}

export function calcCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePer1m: number,
  outputPricePer1m: number,
) {
  const cost =
    (inputTokens / 1_000_000) * inputPricePer1m +
    (outputTokens / 1_000_000) * outputPricePer1m;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function recharge(accountId: string, amount: number, note: string, createdBy: string) {
  if (!(amount > 0)) throw new BillingError("Amount must be positive", "400", 400);
  const sql = getSql();
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string; site_id: string; balance: string }[]>`
      SELECT id, site_id, balance::text FROM accounts WHERE id = ${accountId} FOR UPDATE
    `;
    const account = rows[0];
    if (!account) throw new BillingError("Account not found", "404", 404);
    const next = Number(account.balance) + amount;
    await tx`
      UPDATE accounts SET balance = ${next}, updated_at = NOW() WHERE id = ${accountId}
    `;
    const ledger = await tx<{ id: string }[]>`
      INSERT INTO balance_ledgers (account_id, site_id, type, amount, balance_after, note, created_by)
      VALUES (${accountId}, ${account.site_id}, 'recharge', ${amount}, ${next}, ${note}, ${createdBy})
      RETURNING id
    `;
    return { balance: next, ledger_id: ledger[0].id };
  });
}

export async function chargeAccount(opts: {
  accountId: string;
  siteId: string;
  amount: number;
  usageLogId: string;
  note?: string;
}) {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const rows = await tx<{ balance: string; status: string }[]>`
      SELECT balance::text, status FROM accounts WHERE id = ${opts.accountId} FOR UPDATE
    `;
    const account = rows[0];
    if (!account || account.status !== "active") {
      throw new BillingError("Account disabled", "403", 403);
    }
    const balance = Number(account.balance);
    if (balance < opts.amount) {
      throw new BillingError("Insufficient balance", "402", 402);
    }
    const next = Math.round((balance - opts.amount) * 1_000_000) / 1_000_000;
    await tx`
      UPDATE accounts SET balance = ${next}, updated_at = NOW() WHERE id = ${opts.accountId}
    `;
    await tx`
      INSERT INTO balance_ledgers (account_id, site_id, type, amount, balance_after, usage_log_id, note, created_by)
      VALUES (
        ${opts.accountId},
        ${opts.siteId},
        'charge',
        ${-opts.amount},
        ${next},
        ${opts.usageLogId},
        ${opts.note ?? "API charge"},
        'system'
      )
    `;
    return { balance: next };
  });
}
