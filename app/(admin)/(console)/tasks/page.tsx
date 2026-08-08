"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Tip } from "../../tip";
import { Field, Panel } from "../../ui";

type FieldSchema = { key: string; label?: string; required?: boolean; example?: string };

type Task = {
  id: string;
  task_code: string;
  name: string;
  description: string | null;
  default_model_id: string;
  temperature: string;
  max_tokens: number;
  status: string;
  input_schema: FieldSchema[];
  has_global_prompt?: boolean;
  site_override_count?: number;
};

type Model = { model_id: string; display_name: string };

export default function TasksPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    task_code: "",
    name: "",
    description: "",
    default_model_id: "openai/gpt-4o-mini",
    temperature: "0.7",
    max_tokens: "2048",
    input_schema_text: "",
  });
  const [msg, setMsg] = useState("");

  function parseFields(text: string): FieldSchema[] {
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
    if (m.items?.[0]) {
      setForm((f) => {
        const exists = m.items.some((x: Model) => x.model_id === f.default_model_id);
        return exists ? f : { ...f, default_model_id: m.items[0].model_id };
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  function fillExample() {
    setForm({
      task_code: "product_desc",
      name: "商品描述生成",
      description: "各行业商品文案。服装/五金差异用站点提示词覆盖，不必拆多个 task。",
      default_model_id: models[0]?.model_id || "openai/gpt-4o-mini",
      temperature: "0.7",
      max_tokens: "2048",
      input_schema_text: "product_name*,color,material",
    });
    setShowCreate(true);
  }

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
    setMsg("任务已创建，请进入详情配置全局提示词");
    setShowCreate(false);
    setForm({
      task_code: "",
      name: "",
      description: "",
      default_model_id: models[0]?.model_id || "openai/gpt-4o-mini",
      temperature: "0.7",
      max_tokens: "2048",
      input_schema_text: "",
    });
    load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>任务管理</h1>
          <p className="muted">Task = 能力名。行业差异请在详情页用站点提示词覆盖。</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={fillExample}>
            填入示例
          </button>
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "收起创建" : "新建任务"}
          </button>
        </div>
      </div>

      <Tip title="配置顺序：建任务 → 全局提示词 → 站点覆盖">
        <p>
          服装站与五金站共用同一 <code>task_code</code>（如 product_desc），只在提示词层面做差异。
        </p>
      </Tip>

      {showCreate ? (
        <Panel
          title="新建任务"
          subtitle="先定义业务站要传的字段；提示词稍后再写。"
        >
          <form className="form-grid" onSubmit={onCreate}>
            <Field label="task_code" hint="示例：product_desc（业务站 /run 传这个名）">
              <input
                value={form.task_code}
                onChange={(e) => setForm({ ...form, task_code: e.target.value })}
                placeholder="product_desc"
                required
              />
            </Field>
            <Field label="显示名称" hint="示例：商品描述生成">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="商品描述生成"
                required
              />
            </Field>
            <Field
              label="能力说明"
              hint="示例：各行业商品文案。服装/五金用站点覆盖提示词。"
            >
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="各行业商品文案。服装/五金差异用站点提示词覆盖。"
              />
            </Field>
            <Field
              label="输入字段契约"
              hint="逗号分隔；加 * 表示必填。示例：product_name*,color,material"
            >
              <input
                value={form.input_schema_text}
                onChange={(e) => setForm({ ...form, input_schema_text: e.target.value })}
                placeholder="product_name*,color,material"
              />
            </Field>
            <Field label="默认模型">
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
            </Field>
            <div className="form-row-2">
              <Field label="temperature" hint="示例：0.7">
                <input
                  type="number"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                />
              </Field>
              <Field label="max_tokens" hint="示例：2048">
                <input
                  type="number"
                  value={form.max_tokens}
                  onChange={(e) => setForm({ ...form, max_tokens: e.target.value })}
                />
              </Field>
            </div>
            <div className="form-actions">
              <button type="submit">创建任务</button>
            </div>
          </form>
        </Panel>
      ) : null}

      {msg ? <p className="ok">{msg}</p> : null}

      <Panel title="任务列表" subtitle="点击「配置提示词」进入详情中心">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>能力</th>
                <th>输入字段</th>
                <th>提示词状态</th>
                <th>模型</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="mono">{t.task_code}</div>
                    <div>{t.name}</div>
                    {t.description ? <div className="muted small">{t.description}</div> : null}
                  </td>
                  <td className="mono">
                    {(t.input_schema || [])
                      .map((f) => f.key + (f.required ? "*" : ""))
                      .join(", ") || "-"}
                  </td>
                  <td>
                    <div>
                      全局：
                      {t.has_global_prompt ? (
                        <span className="ok">已配</span>
                      ) : (
                        <span className="error">缺失</span>
                      )}
                    </div>
                    <div className="muted small">站点覆盖 {t.site_override_count || 0}</div>
                  </td>
                  <td className="mono small">{t.default_model_id}</td>
                  <td>{t.status}</td>
                  <td>
                    <Link className="link-btn" href={`/tasks/${t.id}`}>
                      配置提示词
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
