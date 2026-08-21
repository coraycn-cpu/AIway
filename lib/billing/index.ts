import { getSql } from "@/lib/db";
import { ensureRelayHardeningSchema } from "@/lib/db/ensure-relay-hardening";

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
  await ensureRelayHardeningSchema();
  const sql = getSql();
  const rows = await sql<
    { balance: string; held_balance: string; month_quota: string | null; status: string }[]
  >`
    SELECT balance::text,
           COALESCE(held_balance, 0)::text AS held_balance,
           month_quota::text,
           status
    FROM accounts
    WHERE id = ${accountId}
    LIMIT 1
  `;
  const account = rows[0];
  if (!account || account.status !== "active") {
    throw new BillingError("Account disabled", "403", 403);
  }
  const available = Number(account.balance) - Number(account.held_balance || 0);
  if (available <= 0 || available < estimatedCost) {
    throw new BillingError("Insufficient balance", "402", 402);
  }
  if (account.month_quota != null) {
    const used = await getMonthUsed(accountId);
    const remaining = Number(account.month_quota) - used;
    if (remaining <= 0 || remaining < estimatedCost) {
      throw new BillingError("Monthly quota exceeded", "402", 402);
    }
  }
  return {
    balance: Number(account.balance),
    held_balance: Number(account.held_balance || 0),
    available,
    month_quota: account.month_quota,
  };
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

export function estimateHoldCost(opts: {
  inputPricePer1m: number;
  outputPricePer1m: number;
  maxTokens?: number;
  imageCount?: number;
  minCostPerCall?: number;
}) {
  const maxTokens = Math.min(Math.max(opts.maxTokens ?? 1024, 256), 8000);
  const tokenEst = calcCost(
    Math.ceil(maxTokens * 0.5),
    maxTokens,
    opts.inputPricePer1m,
    opts.outputPricePer1m,
  );
  const imageFloor =
    (opts.imageCount || 0) > 0
      ? Math.max(opts.minCostPerCall || 0, 0.03) * (opts.imageCount || 1)
      : opts.minCostPerCall || 0;
  return Math.max(tokenEst, imageFloor, 0.001);
}

/** Lock funds before upstream call to prevent concurrent overspend. */
export async function reserveHold(opts: {
  accountId: string;
  amount: number;
  requestId: string;
}) {
  await ensureRelayHardeningSchema();
  const amount = Math.round(Math.max(opts.amount, 0.001) * 1_000_000) / 1_000_000;
  const sql = getSql();
  return sql.begin(async (tx) => {
    const rows = await tx<
      { balance: string; held_balance: string; month_quota: string | null; status: string }[]
    >`
      SELECT balance::text,
             COALESCE(held_balance, 0)::text AS held_balance,
             month_quota::text,
             status
      FROM accounts
      WHERE id = ${opts.accountId}
      FOR UPDATE
    `;
    const account = rows[0];
    if (!account || account.status !== "active") {
      throw new BillingError("Account disabled", "403", 403);
    }
    const balance = Number(account.balance);
    const held = Number(account.held_balance || 0);
    const available = balance - held;
    if (available < amount) {
      throw new BillingError("Insufficient balance", "402", 402);
    }
    if (account.month_quota != null) {
      const usedRows = await tx<{ month_used: string }[]>`
        SELECT COALESCE(SUM(cost), 0)::text AS month_used
        FROM usage_logs
        WHERE account_id = ${opts.accountId}
          AND status = 'success'
          AND created_at >= date_trunc('month', NOW())
      `;
      const remaining = Number(account.month_quota) - Number(usedRows[0]?.month_used ?? 0);
      if (remaining < amount) {
        throw new BillingError("Monthly quota exceeded", "402", 402);
      }
    }
    const nextHeld = Math.round((held + amount) * 1_000_000) / 1_000_000;
    await tx`
      UPDATE accounts
      SET held_balance = ${nextHeld}, updated_at = NOW()
      WHERE id = ${opts.accountId}
    `;
    return { holdAmount: amount, requestId: opts.requestId };
  });
}

export async function releaseHold(opts: { accountId: string; amount: number }) {
  const amount = Math.round(Math.max(opts.amount, 0) * 1_000_000) / 1_000_000;
  if (amount <= 0) return;
  const sql = getSql();
  await sql.begin(async (tx) => {
    const rows = await tx<{ held_balance: string }[]>`
      SELECT COALESCE(held_balance, 0)::text AS held_balance
      FROM accounts WHERE id = ${opts.accountId} FOR UPDATE
    `;
    const held = Number(rows[0]?.held_balance || 0);
    const nextHeld = Math.max(0, Math.round((held - amount) * 1_000_000) / 1_000_000);
    await tx`
      UPDATE accounts SET held_balance = ${nextHeld}, updated_at = NOW()
      WHERE id = ${opts.accountId}
    `;
  });
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
  /** If set, release this hold while charging actual amount. */
  holdAmount?: number;
}) {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const rows = await tx<{ balance: string; held_balance: string; status: string }[]>`
      SELECT balance::text, COALESCE(held_balance, 0)::text AS held_balance, status
      FROM accounts WHERE id = ${opts.accountId} FOR UPDATE
    `;
    const account = rows[0];
    if (!account || account.status !== "active") {
      throw new BillingError("Account disabled", "403", 403);
    }
    const balance = Number(account.balance);
    const held = Number(account.held_balance || 0);
    const holdAmount = Math.min(held, Math.max(0, opts.holdAmount ?? 0));
    const available = balance - (held - holdAmount);
    if (available < opts.amount) {
      throw new BillingError("Insufficient balance", "402", 402);
    }
    const nextBalance = Math.round((balance - opts.amount) * 1_000_000) / 1_000_000;
    const nextHeld = Math.max(0, Math.round((held - holdAmount) * 1_000_000) / 1_000_000);
    await tx`
      UPDATE accounts
      SET balance = ${nextBalance}, held_balance = ${nextHeld}, updated_at = NOW()
      WHERE id = ${opts.accountId}
    `;
    await tx`
      INSERT INTO balance_ledgers (account_id, site_id, type, amount, balance_after, usage_log_id, note, created_by)
      VALUES (
        ${opts.accountId},
        ${opts.siteId},
        'charge',
        ${-opts.amount},
        ${nextBalance},
        ${opts.usageLogId},
        ${opts.note ?? "API charge"},
        'system'
      )
    `;
    return { balance: nextBalance };
  });
}
