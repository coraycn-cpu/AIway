"use client";

import { FormEvent, useEffect, useState } from "react";

type Site = { id: string; code: string; name: string };
type Token = {
  id: string;
  site_code: string;
  prefix: string;
  name: string | null;
  status: string;
  last_used_at: string | null;
  created_at: string;
};

export default function TokensPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [siteId, setSiteId] = useState("");
  const [name, setName] = useState("default");
  const [plain, setPlain] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [s, t] = await Promise.all([
      fetch("/api/admin/sites").then((r) => r.json()),
      fetch("/api/admin/tokens").then((r) => r.json()),
    ]);
    setSites((s.items || []).map((x: Site & { id: string }) => ({ id: x.id, code: x.code, name: x.name })));
    setTokens(t.items || []);
    if (!siteId && s.items?.[0]) setSiteId(s.items[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setPlain("");
    const res = await fetch("/api/admin/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error?.message || "创建失败");
      return;
    }
    setPlain(data.token);
    setMsg("Token 仅展示一次，请立即复制到业务站服务端环境变量");
    load();
  }

  async function revoke(id: string) {
    await fetch("/api/admin/tokens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "revoked" }),
    });
    load();
  }

  return (
    <div className="page">
      <h1>Token 管理</h1>
      <form className="inline-form" onSubmit={onCreate}>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} / {s.name}
            </option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称" />
        <button type="submit">创建 Token</button>
      </form>
      {msg ? <p className="ok">{msg}</p> : null}
      {plain ? (
        <div className="token-once">
          <code>{plain}</code>
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>站点</th>
            <th>前缀</th>
            <th>名称</th>
            <th>状态</th>
            <th>最后使用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id}>
              <td>{t.site_code}</td>
              <td className="mono">{t.prefix}…</td>
              <td>{t.name}</td>
              <td>{t.status}</td>
              <td>{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : "-"}</td>
              <td>
                {t.status === "active" ? (
                  <button type="button" onClick={() => revoke(t.id)}>
                    吊销
                  </button>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
