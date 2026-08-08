"use client";

import { FormEvent, useEffect, useState } from "react";

type Account = {
  id: string;
  site_code: string;
  site_name: string;
  balance: string;
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("Admin recharge");
  const [msg, setMsg] = useState("");

  async function load() {
    const [a, l] = await Promise.all([
      fetch("/api/admin/accounts").then((r) => r.json()),
      fetch("/api/admin/recharge").then((r) => r.json()),
    ]);
    setAccounts(a.items || []);
    setLedgers(l.items || []);
    if (!accountId && a.items?.[0]) setAccountId(a.items[0].id);
  }

  useEffect(() => {
    load();
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
    load();
  }

  return (
    <div className="page">
      <h1>账号 / 充值 / 流水</h1>
      <form className="inline-form" onSubmit={onRecharge}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.site_code} · 余额 {Number(a.balance).toFixed(4)}
            </option>
          ))}
        </select>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" min="0.01" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" />
        <button type="submit">充值</button>
      </form>
      {msg ? <p className="ok">{msg}</p> : null}

      <h2>账号列表</h2>
      <table>
        <thead>
          <tr>
            <th>站点</th>
            <th>余额</th>
            <th>月额度</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>
                {a.site_code} / {a.site_name}
              </td>
              <td>{Number(a.balance).toFixed(6)}</td>
              <td>{a.month_quota ?? "-"}</td>
              <td>{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>流水</h2>
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
          {ledgers.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.created_at).toLocaleString()}</td>
              <td>{l.type}</td>
              <td>{Number(l.amount).toFixed(6)}</td>
              <td>{Number(l.balance_after).toFixed(6)}</td>
              <td>{l.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
