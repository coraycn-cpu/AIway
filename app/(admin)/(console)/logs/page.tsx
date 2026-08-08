"use client";

import { useEffect, useState } from "react";

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

export default function LogsPage() {
  const [items, setItems] = useState<Log[]>([]);
  const [status, setStatus] = useState("");

  async function load(nextStatus = status) {
    const qs = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : "";
    const res = await fetch(`/api/admin/logs${qs}`);
    const data = await res.json();
    if (res.ok) setItems(data.items || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <h1>全局调用日志</h1>
      <div className="inline-form">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load(e.target.value);
          }}
        >
          <option value="">全部状态</option>
          <option value="success">success</option>
          <option value="error">error</option>
          <option value="rejected">rejected</option>
        </select>
        <button type="button" onClick={() => load()}>
          刷新
        </button>
      </div>
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
          {items.map((l) => (
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
