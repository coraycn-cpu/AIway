"use client";

import { FormEvent, useEffect, useState } from "react";

type Model = {
  id: string;
  model_id: string;
  display_name: string;
  input_price_per_1m: string;
  output_price_per_1m: string;
  enabled: boolean;
};

export default function ModelsPage() {
  const [items, setItems] = useState<Model[]>([]);
  const [form, setForm] = useState({
    model_id: "",
    display_name: "",
    input_price_per_1m: "1",
    output_price_per_1m: "2",
  });
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/models");
    const data = await res.json();
    if (res.ok) setItems(data.items || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        input_price_per_1m: Number(form.input_price_per_1m),
        output_price_per_1m: Number(form.output_price_per_1m),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error?.message || "保存失败");
      return;
    }
    setMsg("模型已保存（对客户售价）");
    setForm({ model_id: "", display_name: "", input_price_per_1m: "1", output_price_per_1m: "2" });
    load();
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    load();
  }

  return (
    <div className="page">
      <h1>模型目录</h1>
      <p className="muted">只配置 model_id 与对客户单价；上游 Key 由 Vercel AI Gateway 统一承接。</p>
      <form className="inline-form" onSubmit={onCreate}>
        <input
          placeholder="model_id"
          value={form.model_id}
          onChange={(e) => setForm({ ...form, model_id: e.target.value })}
          required
        />
        <input
          placeholder="显示名"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="输入价/1M"
          value={form.input_price_per_1m}
          onChange={(e) => setForm({ ...form, input_price_per_1m: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          placeholder="输出价/1M"
          value={form.output_price_per_1m}
          onChange={(e) => setForm({ ...form, output_price_per_1m: e.target.value })}
        />
        <button type="submit">保存</button>
      </form>
      {msg ? <p className="ok">{msg}</p> : null}
      <table>
        <thead>
          <tr>
            <th>model_id</th>
            <th>显示名</th>
            <th>输入价/1M</th>
            <th>输出价/1M</th>
            <th>启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td className="mono">{m.model_id}</td>
              <td>{m.display_name}</td>
              <td>{m.input_price_per_1m}</td>
              <td>{m.output_price_per_1m}</td>
              <td>{m.enabled ? "是" : "否"}</td>
              <td>
                <button type="button" onClick={() => toggle(m.id, m.enabled)}>
                  {m.enabled ? "停用" : "启用"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
