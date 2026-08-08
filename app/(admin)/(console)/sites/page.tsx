"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Tip } from "../../tip";
import { Field, Panel } from "../../ui";

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
    setMsg("站点已创建。下一步：发 Token → 充值 → 到任务详情配置站点提示词覆盖（如需）。");
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
      <div className="page-header">
        <div>
          <h1>站点管理</h1>
          <p className="muted">站点负责身份与计费；能力在任务里，话术用提示词覆盖。</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setCode("apparel");
            setName("服装商城");
          }}
        >
          填入示例
        </button>
      </div>

      <Tip title="站点不拥有任务，站点调用任务">
        <p>
          服装/五金若文案不同，共用同一 task，在任务详情做站点提示词覆盖即可。
        </p>
      </Tip>

      <Panel title="开户 / 创建站点">
        <form className="form-grid" onSubmit={onCreate}>
          <div className="form-row-2">
            <Field label="site code" hint="示例：apparel / hardware">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="apparel"
                required
              />
            </Field>
            <Field label="站点名称" hint="示例：服装商城">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="服装商城"
                required
              />
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit">创建站点</button>
          </div>
        </form>
        {msg ? <p className="ok">{msg}</p> : null}
      </Panel>

      <Panel title="站点列表">
        <div className="table-wrap">
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
                  <td>
                    <div className="inline-form">
                      <button type="button" className="btn-secondary" onClick={() => setSelectedId(s.id)}>
                        查看命中
                      </button>
                      <button type="button" onClick={() => toggle(s.id, s.status)}>
                        {s.status === "active" ? "停用" : "启用"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="该站任务命中情况"
        subtitle={coverageTip || "显示当前选中站点对每个任务会命中全局还是覆盖"}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>实际命中</th>
                <th>全局版本</th>
                <th>站点覆盖</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.task_id}>
                  <td>
                    <div className="mono">{c.task_code}</div>
                    <div className="muted small">{c.task_name}</div>
                  </td>
                  <td>
                    {c.resolve_scope === "site" && <span className="ok">站点覆盖</span>}
                    {c.resolve_scope === "global" && <span>全局默认</span>}
                    {c.resolve_scope === "missing" && <span className="error">缺失提示词</span>}
                  </td>
                  <td>{c.global_version ? `v${c.global_version}` : "-"}</td>
                  <td>{c.site_version ? `v${c.site_version}` : "-"}</td>
                  <td>
                    <Link className="link-btn" href={`/tasks/${c.task_id}`}>
                      去配置
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
