"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Tip } from "../../../tip";
import { Field, Panel, usePromptAssist } from "../../../ui";

type SchemaField = { key: string; label?: string; required?: boolean; example?: string };

type Prompt = {
  id: string;
  site_id: string | null;
  site_code: string | null;
  site_name: string | null;
  version: number;
  is_active: boolean;
  system_template: string;
  user_template: string;
  updated_at: string;
};

type Detail = {
  task: {
    id: string;
    task_code: string;
    name: string;
    description: string | null;
    default_model_id: string;
    temperature: string;
    max_tokens: number;
    status: string;
    input_schema: SchemaField[];
  };
  prompts: Prompt[];
  sites: Array<{ id: string; code: string; name: string; status: string }>;
  coverage: {
    has_global_prompt: boolean;
    site_overrides: Array<{ site_id: string; site_code: string; version: number }>;
    sites_using_global: Array<{ id: string; code: string; name: string }>;
  };
  guide: {
    resolve_order: string[];
    business_call: { task: string; input_fields: string[] };
  };
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [siteId, setSiteId] = useState("");
  const [industryHint, setIndustryHint] = useState("");
  const [systemTemplate, setSystemTemplate] = useState("");
  const [userTemplate, setUserTemplate] = useState("");
  const [previewInput, setPreviewInput] = useState("{}");
  const [preview, setPreview] = useState<{ system: string; user: string } | null>(null);
  const [schemaText, setSchemaText] = useState("");
  const [description, setDescription] = useState("");
  const { assist, loading, error: assistError, notes } = usePromptAssist();

  async function load() {
    const res = await fetch(`/api/admin/tasks/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message || "加载失败");
      return;
    }
    setData(json);
    setDescription(json.task.description || "");
    setSchemaText(
      (json.task.input_schema || [])
        .map((f: SchemaField) => f.key + (f.required ? "*" : ""))
        .join(","),
    );
    const example: Record<string, string> = {};
    for (const f of json.task.input_schema || []) {
      example[f.key] =
        f.example ||
        (f.key.includes("name")
          ? "示例商品"
          : f.key.includes("color")
            ? "黑色"
            : f.key.includes("material")
              ? "棉"
              : "");
    }
    setPreviewInput(JSON.stringify(example, null, 2));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const selectedSite = useMemo(
    () => data?.sites.find((s) => s.id === siteId) || null,
    [data, siteId],
  );
  const activeGlobal = useMemo(
    () => data?.prompts.find((p) => !p.site_id && p.is_active),
    [data],
  );

  function fillPromptExample() {
    if (siteId) {
      setIndustryHint(
        selectedSite
          ? `${selectedSite.name}（${selectedSite.code}）行业话术`
          : "站点行业话术",
      );
      setSystemTemplate(
        "你是面向该站点用户的专业文案助手。语气贴合站点行业，信息不明确时明确说明，不要编造。",
      );
      setUserTemplate(
        "商品：{{product_name}}\n颜色：{{color}}\n材质：{{material}}\n请按本站风格输出：卖点一句 + 详情一段。",
      );
    } else {
      setIndustryHint("通用电商商品描述");
      setSystemTemplate(
        "你是资深电商文案助手。根据商品信息输出简洁可上架描述，不要编造规格。",
      );
      setUserTemplate(
        "商品名称：{{product_name}}\n颜色：{{color}}\n材质：{{material}}\n请输出：1) 一句话卖点 2) 80-120字详情。",
      );
    }
  }

  async function saveSchema(e: FormEvent) {
    e.preventDefault();
    const input_schema = schemaText
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((token) => {
        const required = token.endsWith("*");
        const key = required ? token.slice(0, -1).trim() : token;
        return { key, label: key, required, example: "" };
      });
    const res = await fetch("/api/admin/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, description, input_schema }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error?.message || "保存失败");
      return;
    }
    setMsg("任务契约已更新");
    load();
  }

  async function runAssist(mode: "draft" | "improve") {
    const result = await assist({
      task_id: id,
      scope: siteId ? "site" : "global",
      site_code: selectedSite?.code,
      site_name: selectedSite?.name,
      industry_hint: industryHint,
      existing_system: systemTemplate,
      existing_user: userTemplate,
      mode,
    });
    if (!result) return;
    setSystemTemplate(result.system_template);
    setUserTemplate(result.user_template);
    setMsg(mode === "draft" ? "AI 草稿已填入，请预览后保存" : "AI 优化结果已填入，请预览后保存");
  }

  async function savePrompt(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: id,
        site_id: siteId || null,
        system_template: systemTemplate,
        user_template: userTemplate,
        activate: true,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error?.message || "保存失败");
      return;
    }
    setMsg(siteId ? "站点覆盖提示词已激活" : "全局默认提示词已激活");
    load();
  }

  async function activate(promptId: string) {
    const res = await fetch("/api/admin/prompts/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: promptId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error?.message || "激活失败");
      return;
    }
    setMsg(`已回滚激活版本 v${json.version}`);
    load();
  }

  async function doPreview() {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(previewInput);
    } catch {
      setMsg("预览 input JSON 格式不正确");
      return;
    }
    const res = await fetch("/api/admin/prompts/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_template: systemTemplate,
        user_template: userTemplate,
        input,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error?.message || "预览失败");
      return;
    }
    setPreview(json);
  }

  if (error) return <div className="page error">{error}</div>;
  if (!data) return <div className="page">加载中...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="muted">
            <Link href="/tasks">← 任务列表</Link>
          </p>
          <h1>
            {data.task.name} <span className="mono">/{data.task.task_code}</span>
          </h1>
          <p className="muted">模型 {data.task.default_model_id} · temp {data.task.temperature}</p>
        </div>
      </div>

      <Tip title="服装站 / 五金站怎么配？" defaultOpen>
        <ol>
          <li>共用本任务，不要轻易拆成多个 task。</li>
          <li>先保存「全局默认」提示词。</li>
          <li>再选站点，分别写覆盖提示词（可用 AI 起草）。</li>
          <li>解析顺序：{data.guide.resolve_order.join(" → ")}</li>
        </ol>
      </Tip>

      {!data.coverage.has_global_prompt ? (
        <Tip title="缺少全局默认提示词" tone="warn" defaultOpen>
          未覆盖站点调用会 404。请先在下方保存全局默认。
        </Tip>
      ) : (
        <Tip title="当前生效" tone="ok" defaultOpen>
          全局 v{activeGlobal?.version ?? "-"}；站点覆盖 {data.coverage.site_overrides.length} 个；
          仍走全局：{data.coverage.sites_using_global.map((s) => s.code).join(", ") || "无"}。
        </Tip>
      )}

      <div className="layout-2">
        <Panel title="1. 输入字段契约" subtitle="决定业务站 input 要传什么">
          <form className="form-grid" onSubmit={saveSchema}>
            <Field label="能力说明" hint="示例：各行业商品文案，差异用站点覆盖">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="各行业商品文案。服装/五金差异用站点提示词覆盖。"
              />
            </Field>
            <Field label="字段列表" hint="示例：product_name*,color,material（* 必填）">
              <input
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                placeholder="product_name*,color,material"
              />
            </Field>
            <div className="form-actions">
              <button type="submit">保存契约</button>
            </div>
          </form>
        </Panel>

        <Panel title="业务站调用示例">
          <pre className="preview-box">{`POST /api/v1/run
Authorization: Bearer <site_token>

${JSON.stringify(
  {
    task: data.task.task_code,
    input: Object.fromEntries(
      (data.task.input_schema || []).map((f) => [
        f.key,
        f.example ||
          (f.key.includes("name")
            ? "卫衣"
            : f.key.includes("color")
              ? "黑"
              : f.key.includes("material")
                ? "棉"
                : `<${f.key}>`),
      ]),
    ),
  },
  null,
  2,
)}`}</pre>
        </Panel>
      </div>

      <Panel
        title="2. 编写提示词"
        subtitle="先全局，再按站点覆盖；可填示例或让 AI 辅助"
        actions={
          <button type="button" className="btn-secondary" onClick={fillPromptExample}>
            填入示例
          </button>
        }
      >
        <form className="form-grid" onSubmit={savePrompt}>
          <div className="form-row-2">
            <Field label="作用范围">
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">全局默认</option>
                {data.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    站点覆盖：{s.code} / {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="行业/风格（AI 辅助用）"
              hint="示例：服装站，强调面料、版型、穿搭"
            >
              <input
                value={industryHint}
                onChange={(e) => setIndustryHint(e.target.value)}
                placeholder="例如：五金站，强调规格承重与安装注意"
              />
            </Field>
          </div>

          <div className="chip-row">
            <span className="muted">插入变量：</span>
            {(data.task.input_schema || []).map((f) => (
              <button
                key={f.key}
                type="button"
                className="chip"
                onClick={() => setUserTemplate((t) => `${t}{{${f.key}}}`)}
              >
                {`{{${f.key}}}`}
                {f.required ? "*" : ""}
              </button>
            ))}
          </div>

          <Field label="system 模板" hint="角色与边界，尽量短">
            <textarea
              rows={4}
              value={systemTemplate}
              onChange={(e) => setSystemTemplate(e.target.value)}
              placeholder="你是资深电商文案助手。根据商品信息输出简洁可上架描述，不要编造规格。"
            />
          </Field>
          <Field label="user 模板" hint="用 {{字段}} 引用输入；写清输出格式">
            <textarea
              rows={7}
              value={userTemplate}
              onChange={(e) => setUserTemplate(e.target.value)}
              placeholder={
                "商品名称：{{product_name}}\n颜色：{{color}}\n材质：{{material}}\n请输出：1) 一句话卖点 2) 80-120字详情。"
              }
              required
            />
          </Field>

          <div className="form-actions">
            <button type="button" className="btn-secondary" disabled={loading} onClick={() => runAssist("draft")}>
              {loading ? "AI 生成中..." : "AI 起草"}
            </button>
            <button type="button" className="btn-secondary" disabled={loading} onClick={() => runAssist("improve")}>
              {loading ? "AI 优化中..." : "AI 优化当前稿"}
            </button>
            <button type="button" className="btn-secondary" onClick={doPreview}>
              预览渲染
            </button>
            <button type="submit">保存新版本并激活</button>
          </div>
          {assistError ? <p className="error">{assistError}</p> : null}
          {notes ? <p className="muted">AI 说明：{notes}</p> : null}
        </form>
      </Panel>

      <div className="layout-2">
        <Panel title="3. 预览输入 JSON" subtitle="用于检查变量是否替换正确">
          <textarea
            rows={8}
            value={previewInput}
            onChange={(e) => setPreviewInput(e.target.value)}
            className="mono"
            placeholder='{"product_name":"卫衣","color":"黑","material":"棉"}'
          />
        </Panel>
        <Panel title="渲染结果">
          {preview ? (
            <div className="preview-box">
              <h3>system</h3>
              <pre>{preview.system}</pre>
              <h3>user</h3>
              <pre>{preview.user}</pre>
            </div>
          ) : (
            <p className="muted">点击「预览渲染」后显示</p>
          )}
        </Panel>
      </div>

      {msg ? <p className="ok">{msg}</p> : null}

      <Panel title="4. 版本历史 / 回滚">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>范围</th>
                <th>版本</th>
                <th>激活</th>
                <th>更新时间</th>
                <th>摘要</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.prompts.map((p) => (
                <tr key={p.id}>
                  <td>{p.site_code ? `站点:${p.site_code}` : "全局"}</td>
                  <td>v{p.version}</td>
                  <td>{p.is_active ? "是" : "否"}</td>
                  <td>{new Date(p.updated_at).toLocaleString()}</td>
                  <td className="mono small">{p.user_template.slice(0, 48)}</td>
                  <td>
                    {!p.is_active ? (
                      <button type="button" onClick={() => activate(p.id)}>
                        激活此版本
                      </button>
                    ) : (
                      "当前"
                    )}
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
