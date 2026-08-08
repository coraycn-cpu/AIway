"use client";

import { FormEvent, useEffect, useState } from "react";

type SiteRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  account_id: string;
  balance: string;
  month_quota: string | null;
};

export default function SitesPage() {
  const [items, setItems] = useState<SiteRow[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/sites");
    const data = await res.json();
    if (res.ok) setItems(data.items || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error?.message || "创建失败");
      return;
    }
    setCode("");
    setName("");
    setMsg("站点已创建");
    load();
  }

  async function toggle(id: string, status: string) {
    await fetch("/api/admin/sites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: status === "active" ? "disabled" : "active" }),
    });
    load();
  }

  return (
    <div className="page">
      <h1>站点管理</h1>
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="site code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input placeholder="站点名称" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">开户/创建站点</button>
      </form>
      {msg ? <p className="ok">{msg}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>名称</th>
            <th>状态</th>
            <th>余额</th>
            <th>月额度</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td className="mono">{s.code}</td>
              <td>{s.name}</td>
              <td>{s.status}</td>
              <td>{Number(s.balance || 0).toFixed(4)}</td>
              <td>{s.month_quota ?? "-"}</td>
              <td>
                <button type="button" onClick={() => toggle(s.id, s.status)}>
                  {s.status === "active" ? "停用" : "启用"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
