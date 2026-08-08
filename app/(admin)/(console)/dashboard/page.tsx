"use client";

import { useEffect, useState } from "react";

type Dashboard = {
  last_24h_calls: number;
  last_24h_spend: number;
  failure_rate: number;
  low_balance_accounts: number;
  recent: Array<{
    request_id: string;
    task_code: string | null;
    cost: string;
    status: string;
    created_at: string;
    site_code: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || "加载失败");
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <h1>仪表盘</h1>
      <p className="muted">近 24 小时调用概览</p>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span>调用次数</span>
              <strong>{data.last_24h_calls}</strong>
            </div>
            <div className="stat">
              <span>消耗金额</span>
              <strong>{data.last_24h_spend.toFixed(6)}</strong>
            </div>
            <div className="stat">
              <span>失败率</span>
              <strong>{(data.failure_rate * 100).toFixed(1)}%</strong>
            </div>
            <div className="stat">
              <span>低余额账号</span>
              <strong>{data.low_balance_accounts}</strong>
            </div>
          </div>
          <h2>最近调用</h2>
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>站点</th>
                <th>任务</th>
                <th>费用</th>
                <th>状态</th>
                <th>request_id</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.request_id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.site_code}</td>
                  <td>{r.task_code}</td>
                  <td>{Number(r.cost).toFixed(6)}</td>
                  <td>{r.status}</td>
                  <td className="mono">{r.request_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        !error && <p>加载中...</p>
      )}
    </div>
  );
}
