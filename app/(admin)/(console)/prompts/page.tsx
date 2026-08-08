"use client";

import { FormEvent, useEffect, useState } from "react";

type Task = { id: string; task_code: string };
type Site = { id: string; code: string };
type Prompt = {
  id: string;
  task_code: string;
  site_code: string | null;
  version: number;
  is_active: boolean;
  system_template: string;
  user_template: string;
};

export default function PromptsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [items, setItems] = useState<Prompt[]>([]);
  const [taskId, setTaskId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [systemTemplate, setSystemTemplate] = useState("");
  const [userTemplate, setUserTemplate] = useState("{{message}}");
  const [msg, setMsg] = useState("");

  async function load() {
    const [t, s, p] = await Promise.all([
      fetch("/api/admin/tasks").then((r) => r.json()),
      fetch("/api/admin/sites").then((r) => r.json()),
      fetch("/api/admin/prompts").then((r) => r.json()),
    ]);
    setTasks(t.items || []);
    setSites(s.items || []);
    setItems(p.items || []);
    if (!taskId && t.items?.[0]) setTaskId(t.items[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        site_id: siteId || null,
        system_template: systemTemplate,
        user_template: userTemplate,
        activate: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error?.message || "保存失败");
      return;
    }
    setMsg("提示词已保存并激活（站点优先于全局）");
    load();
  }

  return (
    <div className="page">
      <h1>提示词管理</h1>
      <p className="muted">选择规则：站点专属 → 全局默认。变量用 {"{{field}}"}。</p>
      <form className="stack-form" onSubmit={onCreate}>
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)} required>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.task_code}
            </option>
          ))}
        </select>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">全局默认</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              站点覆盖：{s.code}
            </option>
          ))}
        </select>
        <textarea
          rows={3}
          placeholder="system template"
          value={systemTemplate}
          onChange={(e) => setSystemTemplate(e.target.value)}
        />
        <textarea
          rows={5}
          placeholder="user template"
          value={userTemplate}
          onChange={(e) => setUserTemplate(e.target.value)}
          required
        />
        <button type="submit">保存新版本并激活</button>
      </form>
      {msg ? <p className="ok">{msg}</p> : null}
      <table>
        <thead>
          <tr>
            <th>任务</th>
            <th>范围</th>
            <th>版本</th>
            <th>激活</th>
            <th>user 模板</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.task_code}</td>
              <td>{p.site_code || "全局"}</td>
              <td>v{p.version}</td>
              <td>{p.is_active ? "是" : "否"}</td>
              <td className="mono">{p.user_template.slice(0, 80)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
