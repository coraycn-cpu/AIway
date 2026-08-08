"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Tip } from "../../tip";

type SiteRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  account_id: string;
  balance: string;
  month_quota: string | null;
};

type CoverageItem = {
  task_id: string;
  task_code: string;
  task_name: string;
  resolve_scope: "site" | "global" | "missing";
  global_version: number | null;
  site_version: number | null;
};

export default function SitesPage() {
  const [items, setItems] = useState<SiteRow[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [coverageTip, setCoverageTip] = useState("");

  async function load() {
    const res = await fetch("/api/admin/sites");
    const data = await res.json();
    if (res.ok) {
      setItems(data.items || []);
      if (!selectedId && data.items?.[0]) setSelectedId(data.items[0].id);
    }
  }

  async function loadCoverage(siteId: string) {
    if (!siteId) return;
    const res = await fetch(`/api/admin/sites/${siteId}/coverage`);
    const data = await res.json();
    if (res.ok) {
      setCoverage(data.items || []);
      setCoverageTip(data.tip || "");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadCoverage(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
    setMsg("站点已创建。接着发 Token、充值，并到任务详情为该站配置提示词覆盖（如需要）。");
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
      <Tip title="站点不拥有任务，站点调用任务">
        <p>
          开户只解决「谁在调用、花谁的钱」。能力在「任务」里定义；本站若要不同话术，去对应任务详情添加
          <b>站点提示词覆盖</b>（例：服装站 / 五金站共用 <code>product_desc</code>）。
        </p>
      </Tip>

      <form className="inline-form" onSubmit={onCreate}>
        <input
          placeholder="site code，如 apparel / hardware"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <input
          placeholder="站点名称，如服装商城"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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
            <tr key={s.id} className={selectedId === s.id ? "row-selected" : undefined}>
              <td className="mono">{s.code}</td>
              <td>{s.name}</td>
              <td>{s.status}</td>
              <td>{Number(s.balance || 0).toFixed(4)}</td>
              <td>{s.month_quota ?? "-"}</td>
              <td className="inline-form">
                <button type="button" onClick={() => setSelectedId(s.id)}>
                  查看能力命中
                </button>
                <button type="button" onClick={() => toggle(s.id, s.status)}>
                  {s.status === "active" ? "停用" : "启用"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>该站任务命中情况</h2>
      {coverageTip ? <p className="muted">{coverageTip}</p> : null}
      <table>
        <thead>
          <tr>
            <th>任务</th>
            <th>实际命中</th>
            <th>全局版本</th>
            <th>站点覆盖版本</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {coverage.map((c) => (
            <tr key={c.task_id}>
              <td>
                <div className="mono">{c.task_code}</div>
                <div className="muted">{c.task_name}</div>
              </td>
              <td>
                {c.resolve_scope === "site" && <span className="ok">站点覆盖</span>}
                {c.resolve_scope === "global" && <span>全局默认</span>}
                {c.resolve_scope === "missing" && <span className="error">缺失提示词</span>}
              </td>
              <td>{c.global_version ? `v${c.global_version}` : "-"}</td>
              <td>{c.site_version ? `v${c.site_version}` : "-"}</td>
              <td>
                <Link href={`/tasks/${c.task_id}`}>去配置</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
