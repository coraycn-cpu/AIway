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
import { fetchSiteOptions, invalidateAdminOptions } from "../../options-cache";

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
  const [siteId, setSiteId] = useState("");
  const [name, setName] = useState("default");
  const [plain, setPlain] = useState("");
  const [msg, setMsg] = useState("");

  const [filterSiteId, setFilterSiteId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  const list = usePagedList<Token>("/api/admin/tokens", {
    site_id: filterSiteId,
    status,
    q: debouncedQ,
  });

  async function loadSites() {
    const items = await fetchSiteOptions();
    setSites(items.map((x) => ({ id: x.id, code: x.code, name: x.name })));
    if (!siteId && items[0]) setSiteId(items[0].id);
  }

  useEffect(() => {
    loadSites();
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
    invalidateAdminOptions(["sites"]);
    list.reload();
  }

  async function revoke(id: string) {
    await fetch("/api/admin/tokens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "revoked" }),
    });
    list.reload();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Token 管理</h1>
          <p className="muted">按站点 / 状态 / 关键词筛选；列表分页。</p>
        </div>
      </div>

      <Panel title="创建 Token">
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
      </Panel>

      <Panel title="Token 列表">
        <ListToolbar onRefresh={list.reload} loading={list.busy}>
          <input
            className="list-search"
            type="search"
            placeholder="搜索前缀 / 名称 / 站点"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={filterSiteId} onChange={(e) => setFilterSiteId(e.target.value)}>
            <option value="">全部站点</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="revoked">revoked</option>
          </select>
        </ListToolbar>
        {list.error ? <p className="error">{list.error}</p> : null}
        <ListTableShell loading={list.loading} refreshing={list.refreshing}>
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
              {list.items.length === 0 ? (
                <EmptyTableRow colSpan={6} text={list.loading ? "加载中…" : "暂无 Token"} />
              ) : (
                list.items.map((t) => (
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
                ))
              )}
            </tbody>
          </table>
        </ListTableShell>
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        
          disabled={list.busy}
        />
      </Panel>
    </div>
  );
}
