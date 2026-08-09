"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Tip } from "../../tip";
import { Field, Panel } from "../../ui";
import {
  EmptyTableRow,
  ListTableShell,
  ListToolbar,
  Pagination,
  useDebouncedValue,
  usePagedList,
} from "../../list-ui";
import { fetchModelOptions, invalidateAdminOptions } from "../../options-cache";

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
  const [seeding, setSeeding] = useState(false);
  const [presetStatus, setPresetStatus] = useState<{
    ready: boolean;
    missing: string[];
    tip: string;
  } | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [promptStatus, setPromptStatus] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  const list = usePagedList<Task>("/api/admin/tasks", {
    q: debouncedQ,
    status,
    prompt_status: promptStatus,
  });

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

  async function loadMeta() {
    const [m, p] = await Promise.all([
      fetchModelOptions(),
      fetch("/api/admin/tasks/seed-presets").then((r) => r.json()),
    ]);
    setModels(m);
    if (p && typeof p.ready === "boolean") {
      setPresetStatus({
        ready: p.ready,
        missing: p.missing || [],
        tip: p.tip || "",
      });
    }
    if (m[0]) {
      setForm((f) => {
        const exists = m.some((x: Model) => x.model_id === f.default_model_id);
        return exists ? f : { ...f, default_model_id: m[0].model_id };
      });
    }
  }

  useEffect(() => {
    loadMeta();
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

  async function seedPresets() {
    setSeeding(true);
    setMsg("");
    const res = await fetch("/api/admin/tasks/seed-presets", { method: "POST" });
    const data = await res.json();
    setSeeding(false);
    if (!res.ok) {
      setMsg(
        data?.error?.message ||
          "预置失败。若提示缺少 description 字段，请先在 Supabase 执行迁移 002，再点同步。",
      );
      return;
    }
    setMsg(data.tip || "预置能力已同步");
    invalidateAdminOptions(["tasks"]);
    list.reload();
    loadMeta();
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
    invalidateAdminOptions(["tasks"]);
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
    list.reload();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>任务管理</h1>
          <p className="muted">Task = 能力名。行业差异请在详情页用站点提示词覆盖。</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" disabled={seeding} onClick={seedPresets}>
            {seeding ? "同步中..." : "同步预置能力（服装图析/博客SEO）"}
          </button>
          <button type="button" className="btn-secondary" onClick={fillExample}>
            填入示例
          </button>
          <button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "收起创建" : "新建任务"}
          </button>
        </div>
      </div>

      {presetStatus && !presetStatus.ready ? (
        <Tip title="leapclothes 报 Task not found 就是这里" tone="warn" defaultOpen>
          <p>
            预置任务尚未写入数据库（缺失：{" "}
            <code>{(presetStatus.missing || []).join(", ") || "未知"}</code>）。
            ping 能通不代表业务能力已开通。
          </p>
          <p>
            请立即点击右上角 <b>「同步预置能力」</b>，成功后再回业务站重试「AI 识图建档」。
          </p>
        </Tip>
      ) : (
        <Tip title="配置顺序：建任务 → 全局提示词 → 站点覆盖">
          <p>
            预置能力：
            <code>apparel_image_enrich</code> /
            <code>blog_topic_recommend</code> /
            <code>blog_seo_article</code>
          </p>
        </Tip>
      )}

      {showCreate ? (
        <Panel title="新建任务" subtitle="先定义业务站要传的字段；提示词稍后再写。">
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
        <ListToolbar onRefresh={list.reload} loading={list.busy}>
          <input
            className="list-search"
            type="search"
            placeholder="搜索 task_code / 名称 / 模型"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
          <select value={promptStatus} onChange={(e) => setPromptStatus(e.target.value)}>
            <option value="">提示词全部</option>
            <option value="has_global">已配全局</option>
            <option value="missing_global">缺全局</option>
          </select>
        </ListToolbar>
        {list.error ? <p className="error">{list.error}</p> : null}
        <ListTableShell loading={list.loading} refreshing={list.refreshing}>
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
              {list.items.length === 0 ? (
                <EmptyTableRow colSpan={6} text={list.loading ? "加载中…" : "暂无任务"} />
              ) : (
                list.items.map((t) => (
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
