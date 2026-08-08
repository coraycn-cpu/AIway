"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Tip } from "../../tip";

type Field = { key: string; label?: string; required?: boolean; example?: string };

type Task = {
  id: string;
  task_code: string;
  name: string;
  description: string | null;
  default_model_id: string;
  temperature: string;
  max_tokens: number;
  status: string;
  input_schema: Field[];
  has_global_prompt?: boolean;
  site_override_count?: number;
};

type Model = { model_id: string; display_name: string };

export default function TasksPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [form, setForm] = useState({
    task_code: "product_desc",
    name: "商品描述生成",
    description: "各行业商品文案能力。服装/五金差异用站点提示词覆盖，不必拆多个 task。",
    default_model_id: "openai/gpt-4o-mini",
    temperature: "0.7",
    max_tokens: "2048",
    input_schema_text: "product_name*,color,material",
  });
  const [msg, setMsg] = useState("");

  function parseFields(text: string): Field[] {
    return text
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((token) => {
        const required = token.endsWith("*");
        const key = required ? token.slice(0, -1).trim() : token;
        return { key, label: key, required, example: "" };
      });
  }

  async function load() {
    const [t, m] = await Promise.all([
      fetch("/api/admin/tasks").then((r) => r.json()),
      fetch("/api/admin/models").then((r) => r.json()),
    ]);
    setItems(t.items || []);
    setModels(m.items || []);
    if (m.items?.[0] && form.default_model_id === "openai/gpt-4o-mini") {
      const exists = m.items.some((x: Model) => x.model_id === form.default_model_id);
      if (!exists) setForm((f) => ({ ...f, default_model_id: m.items[0].model_id }));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_code: form.task_code,
        name: form.name,
        description: form.description,
        default_model_id: form.default_model_id,
        temperature: Number(form.temperature),
        max_tokens: Number(form.max_tokens),
        input_schema: parseFields(form.input_schema_text),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error?.message || "创建失败");
      return;
    }
    setMsg("任务已创建。请进入详情页配置「全局默认提示词」，再按需为服装/五金站做站点覆盖。");
    load();
  }

  return (
    <div className="page">
      <h1>任务管理</h1>
      <Tip title="怎么理解 Task？">
        <p>
          <b>Task = 能力名（业务站调用契约）</b>，例如统一用 <code>product_desc</code>。
          服装站和五金站可以共用同一 task；行业话术差异请到任务详情里做
          <b>站点提示词覆盖</b>，而不是先拆一堆 task。
        </p>
        <p>
          推荐顺序：① 创建任务并声明输入字段 → ② 配置全局默认提示词 → ③
          仅为需要差异化的站点添加覆盖。
        </p>
      </Tip>

      <form className="stack-form" onSubmit={onCreate}>
        <input
          placeholder="task_code（业务站传这个名）"
          value={form.task_code}
          onChange={(e) => setForm({ ...form, task_code: e.target.value })}
          required
        />
        <input
          placeholder="显示名称"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <textarea
          rows={2}
          placeholder="能力说明（给管理员看）"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <label>
          输入字段契约（逗号分隔；加 * 表示必填）
          <input
            value={form.input_schema_text}
            onChange={(e) => setForm({ ...form, input_schema_text: e.target.value })}
            placeholder="product_name*,color,material"
          />
        </label>
        <p className="muted">
          业务站 <code>/run</code> 的 <code>input</code> 应按此字段传值；提示词里用{" "}
          <code>{"{{product_name}}"}</code> 引用。
        </p>
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
            title="temperature"
          />
          <input
            type="number"
            value={form.max_tokens}
            onChange={(e) => setForm({ ...form, max_tokens: e.target.value })}
            title="max_tokens"
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
            <th>输入字段</th>
            <th>全局提示词</th>
            <th>站点覆盖</th>
            <th>模型</th>
            <th>状态</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td className="mono">{t.task_code}</td>
              <td>
                {t.name}
                {t.description ? <div className="muted">{t.description}</div> : null}
              </td>
              <td className="mono">
                {(t.input_schema || []).map((f) => f.key + (f.required ? "*" : "")).join(", ") ||
                  "-"}
              </td>
              <td>
                {t.has_global_prompt ? (
                  <span className="ok">已配置</span>
                ) : (
                  <span className="error">缺失</span>
                )}
              </td>
              <td>{t.site_override_count || 0}</td>
              <td className="mono">{t.default_model_id}</td>
              <td>{t.status}</td>
              <td>
                <Link href={`/tasks/${t.id}`}>详情 / 提示词</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
