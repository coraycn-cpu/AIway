"use client";

import { useEffect, useState } from "react";
import { Panel } from "../../ui";
import {
  EmptyTableRow,
  ListTableShell,
  ListToolbar,
  Pagination,
  useDebouncedValue,
  usePagedList,
} from "../../list-ui";
import { fetchSiteOptions } from "../../options-cache";

type Log = {
  id: string;
  request_id: string;
  site_code: string;
  task_code: string | null;
  model_id: string | null;
  total_tokens: number;
  cost: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type SiteOpt = { id: string; code: string; name: string };

export default function LogsPage() {
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [siteId, setSiteId] = useState("");
  const [task, setTask] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  const list = usePagedList<Log>("/api/admin/logs", {
    q: debouncedQ,
    status,
    site_id: siteId,
    task,
    from: from ? new Date(from).toISOString() : "",
    to: to ? new Date(to).toISOString() : "",
  });

  useEffect(() => {
    fetchSiteOptions()
      .then((items) => setSites(items.map((x) => ({ id: x.id, code: x.code, name: x.name }))))
      .catch(() => undefined);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>全局调用日志</h1>
          <p className="muted">支持按站点、任务、状态、时间与关键词筛选，并分页浏览。</p>
        </div>
      </div>

      <Panel title="调用记录">
        <ListToolbar onRefresh={list.reload} loading={list.busy}>
          <input
            className="list-search"
            type="search"
            placeholder="搜索 request_id / 任务 / 模型 / 站点 / 错误"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="success">success</option>
            <option value="error">error</option>
            <option value="rejected">rejected</option>
          </select>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">全部站点</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
          <input
            placeholder="task_code"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </ListToolbar>

        {list.error ? <p className="error">{list.error}</p> : null}

        <ListTableShell loading={list.loading} refreshing={list.refreshing}>
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>站点</th>
                <th>任务</th>
                <th>模型</th>
                <th>tokens</th>
                <th>费用</th>
                <th>状态</th>
                <th>request_id</th>
              </tr>
            </thead>
            <tbody>
              {list.items.length === 0 ? (
                <EmptyTableRow colSpan={8} text={list.loading ? "加载中…" : "暂无日志"} />
              ) : (
                list.items.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.site_code}</td>
                    <td>{l.task_code}</td>
                    <td className="mono">{l.model_id}</td>
                    <td>{l.total_tokens}</td>
                    <td>{Number(l.cost).toFixed(6)}</td>
                    <td title={l.error_message || ""}>{l.status}</td>
                    <td className="mono">{l.request_id}</td>
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
