"use client";

import { FormEvent, useEffect, useState } from "react";

type Task = {
  id: string;
  task_code: string;
  name: string;
  default_model_id: string;
  temperature: string;
  max_tokens: number;
  status: string;
};

type Model = { model_id: string; display_name: string };

export default function TasksPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [form, setForm] = useState({
    task_code: "",
    name: "",
    default_model_id: "openai/gpt-4o-mini",
    temperature: "0.7",
    max_tokens: "2048",
  });
  const [msg, setMsg] = useState("");

  async function load() {
    const [t, m] = await Promise.all([
      fetch("/api/admin/tasks").then((r) => r.json()),
      fetch("/api/admin/models").then((r) => r.json()),
    ]);
    setItems(t.items || []);
    setModels(m.items || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        temperature: Number(form.temperature),
        max_tokens: Number(form.max_tokens),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error?.message || "创建失败");
      return;
    }
    setMsg("任务已创建");
    setForm({ ...form, task_code: "", name: "" });
    load();
  }

  return (
    <div className="page">
      <h1>任务管理</h1>
      <form className="stack-form" onSubmit={onCreate}>
        <input
          placeholder="task_code"
          value={form.task_code}
          onChange={(e) => setForm({ ...form, task_code: e.target.value })}
          required
        />
        <input
          placeholder="名称"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <select
          value={form.default_model_id}
          onChange={(e) => setForm({ ...form, default_model_id: e.target.value })}
        >
          {models.map((m) => (
            <option key={m.model_id} value={m.model_id}>
              {m.display_name} ({m.model_id})
            </option>
          ))}
        </select>
        <div className="inline-form">
          <input
            type="number"
            step="0.1"
            value={form.temperature}
            onChange={(e) => setForm({ ...form, temperature: e.target.value })}
          />
          <input
            type="number"
            value={form.max_tokens}
            onChange={(e) => setForm({ ...form, max_tokens: e.target.value })}
          />
          <button type="submit">创建任务</button>
        </div>
      </form>
      {msg ? <p className="ok">{msg}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>名称</th>
            <th>模型</th>
            <th>温度</th>
            <th>max_tokens</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td className="mono">{t.task_code}</td>
              <td>{t.name}</td>
              <td className="mono">{t.default_model_id}</td>
              <td>{t.temperature}</td>
              <td>{t.max_tokens}</td>
              <td>{t.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
