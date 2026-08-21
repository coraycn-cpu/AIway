"use client";

import { FormEvent, useEffect, useState } from "react";
import { Panel } from "../../ui";
import {
  EmptyTableRow,
  ListTableShell,
  ListToolbar,
  Pagination,
  useDebouncedValue,
  usePagedList,
} from "../../list-ui";
import { fetchAccountOptions, fetchSiteOptions, invalidateAdminOptions } from "../../options-cache";

type Account = {
  id: string;
  site_id: string;
  site_code: string;
  site_name: string;
  balance: string;
  held_balance?: string;
  month_quota: string | null;
  status: string;
};

type Ledger = {
  id: string;
  type: string;
  amount: string;
  balance_after: string;
  note: string | null;
  created_at: string;
};

type SiteOpt = { id: string; code: string; name: string };

export default function AccountsPage() {
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("Admin recharge");
  const [msg, setMsg] = useState("");

  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  const [ledgerAccountId, setLedgerAccountId] = useState("");
  const [ledgerType, setLedgerType] = useState("");
  const [ledgerQ, setLedgerQ] = useState("");
  const debouncedLedgerQ = useDebouncedValue(ledgerQ, 300);

  const accounts = usePagedList<Account>("/api/admin/accounts", {
    site_id: siteFilter,
    status: statusFilter,
    q: debouncedQ,
  });

  const ledgers = usePagedList<Ledger>("/api/admin/recharge", {
    account_id: ledgerAccountId,
    type: ledgerType,
    q: debouncedLedgerQ,
  });

  async function loadOptions() {
    const [s, a] = await Promise.all([fetchSiteOptions(), fetchAccountOptions()]);
    setSites(s.map((x) => ({ id: x.id, code: x.code, name: x.name })));
    setAllAccounts(
      a.map((x) => ({
        id: x.id,
        site_id: x.site_id,
        site_code: x.site_code,
        site_name: x.site_name,
        balance: x.balance,
        month_quota: x.month_quota ?? null,
        status: x.status,
      })),
    );
    if (!accountId && a[0]) setAccountId(a[0].id);
  }

  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRecharge(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/recharge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, amount: Number(amount), note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error?.message || "充值失败");
      return;
    }
    setMsg(`充值成功，余额 ${data.balance}`);
    invalidateAdminOptions(["accounts"]);
    accounts.reload();
    ledgers.reload();
    loadOptions();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>账号 / 充值 / 流水</h1>
          <p className="muted">账号与流水支持筛选分页；充值表单独立于列表筛选。</p>
        </div>
      </div>

      <Panel title="充值">
        <form className="inline-form" onSubmit={onRecharge}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            {allAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.site_code} · 余额 {Number(a.balance).toFixed(4)}
              </option>
            ))}
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            step="0.01"
            min="0.01"
          />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" />
          <button type="submit">充值</button>
        </form>
        {msg ? <p className="ok">{msg}</p> : null}
      </Panel>

      <Panel title="账号列表">
        <ListToolbar onRefresh={accounts.reload} loading={accounts.busy}>
          <input
            className="list-search"
            type="search"
            placeholder="搜索站点 code / 名称"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">全部站点</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </ListToolbar>
        {accounts.error ? <p className="error">{accounts.error}</p> : null}
        <ListTableShell loading={accounts.loading} refreshing={accounts.refreshing}>
          <table>
            <thead>
              <tr>
                <th>站点</th>
                <th>余额</th>
                <th>预扣</th>
                <th>可用</th>
                <th>月额度</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.items.length === 0 ? (
                <EmptyTableRow colSpan={7} text={accounts.loading ? "加载中…" : "暂无账号"} />
              ) : (
                accounts.items.map((a) => {
                  const bal = Number(a.balance);
                  const held = Number(a.held_balance || 0);
                  return (
                  <tr key={a.id}>
                    <td>
                      {a.site_code} / {a.site_name}
                    </td>
                    <td>{bal.toFixed(6)}</td>
                    <td>{held.toFixed(6)}</td>
                    <td>{Math.max(0, bal - held).toFixed(6)}</td>
                    <td>{a.month_quota ?? "-"}</td>
                    <td>{a.status}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setLedgerAccountId(a.id)}
                      >
                        看流水
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ListTableShell>
        <Pagination
          page={accounts.page}
          pageSize={accounts.pageSize}
          total={accounts.total}
          onPageChange={accounts.setPage}
          onPageSizeChange={accounts.setPageSize}
        
          disabled={accounts.busy}
        />
      </Panel>

      <Panel title="流水">
        <ListToolbar onRefresh={ledgers.reload} loading={ledgers.busy}>
          <input
            className="list-search"
            type="search"
            placeholder="搜索备注 / 操作人"
            value={ledgerQ}
            onChange={(e) => setLedgerQ(e.target.value)}
          />
          <select value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)}>
            <option value="">全部账号</option>
            {allAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.site_code}
              </option>
            ))}
          </select>
          <select value={ledgerType} onChange={(e) => setLedgerType(e.target.value)}>
            <option value="">全部类型</option>
            <option value="recharge">recharge</option>
            <option value="charge">charge</option>
            <option value="adjust">adjust</option>
          </select>
        </ListToolbar>
        {ledgers.error ? <p className="error">{ledgers.error}</p> : null}
        <ListTableShell loading={ledgers.loading} refreshing={ledgers.refreshing}>
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>金额</th>
                <th>余额后</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.items.length === 0 ? (
                <EmptyTableRow colSpan={5} text={ledgers.loading ? "加载中…" : "暂无流水"} />
              ) : (
                ledgers.items.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.type}</td>
                    <td>{Number(l.amount).toFixed(6)}</td>
                    <td>{Number(l.balance_after).toFixed(6)}</td>
                    <td>{l.note}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ListTableShell>
        <Pagination
          page={ledgers.page}
          pageSize={ledgers.pageSize}
          total={ledgers.total}
          onPageChange={ledgers.setPage}
          onPageSizeChange={ledgers.setPageSize}
        
          disabled={ledgers.busy}
        />
      </Panel>
    </div>
  );
}
