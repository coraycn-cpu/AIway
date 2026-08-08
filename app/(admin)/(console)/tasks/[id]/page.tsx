"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Tip } from "../../../tip";

type Field = { key: string; label?: string; required?: boolean; example?: string };

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
    input_schema: Field[];
  };
  prompts: Prompt[];
  sites: Array<{ id: string; code: string; name: string; status: string }>;
  coverage: {
    has_global_prompt: boolean;
    site_overrides: Array<{ site_id: string; site_code: string; version: number }>;
    sites_using_global: Array<{ id: string; code: string; name: string }>;
  };
  guide: {
    principle: string;
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
  const [systemTemplate, setSystemTemplate] = useState(
    "你是资深电商文案助手，按行业语气输出简洁商品描述。",
  );
  const [userTemplate, setUserTemplate] = useState(
    "商品：{{product_name}}\n颜色：{{color}}\n材质/面料：{{material}}\n请输出一段销售向描述。",
  );
  const [previewInput, setPreviewInput] = useState("{}");
  const [preview, setPreview] = useState<{ system: string; user: string } | null>(null);
  const [schemaText, setSchemaText] = useState("");
  const [description, setDescription] = useState("");

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
        .map((f: Field) => f.key + (f.required ? "*" : ""))
        .join(","),
    );
    const example: Record<string, string> = {};
    for (const f of json.task.input_schema || []) {
      example[f.key] = f.example || (f.key === "product_name" ? "示例商品" : "");
    }
    setPreviewInput(JSON.stringify(example, null, 2));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const activeGlobal = useMemo(
    () => data?.prompts.find((p) => !p.site_id && p.is_active),
    [data],
  );

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
    setMsg(
      siteId
        ? "已保存并激活「站点覆盖」提示词。该站调用时将优先使用此版本。"
        : "已保存并激活「全局默认」提示词。未做覆盖的站点都会用它。",
    );
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

  function insertVar(key: string) {
    setUserTemplate((t) => `${t}{{${key}}}`);
  }

  if (error) return <div className="page error">{error}</div>;
  if (!data) return <div className="page">加载中...</div>;

  return (
    <div className="page">
      <p>
        <Link href="/tasks">← 返回任务列表</Link>
      </p>
      <h1>
        任务详情 <span className="mono">{data.task.task_code}</span>
      </h1>
      <p className="muted">{data.task.name}</p>

      <Tip title="服装站 vs 五金站：怎么配？">
        <ol>
          <li>
            共用本任务（不要拆成 apparel / hardware 两个 task，除非输入输出结构差很多）。
          </li>
          <li>先配好下方「全局默认」提示词，保证所有站都能跑。</li>
          <li>
            再选择具体站点，保存「站点覆盖」：服装站强调面料/版型，五金站强调规格/承重。
          </li>
          <li>
            解析顺序：<b>{data.guide.resolve_order.join(" → ")}</b>
          </li>
        </ol>
      </Tip>

      {!data.coverage.has_global_prompt ? (
        <Tip title="重要：缺少全局默认提示词" tone="warn">
          当前没有激活的全局提示词。未覆盖站点调用会直接 404。请先保存一份「全局默认」。
        </Tip>
      ) : (
        <Tip title="当前生效概况" tone="ok">
          全局默认已就绪（v{activeGlobal?.version ?? "-"}）。站点覆盖{" "}
          {data.coverage.site_overrides.length} 个；仍走全局的站点：{" "}
          {data.coverage.sites_using_global.map((s) => s.code).join(", ") || "无"}。
        </Tip>
      )}

      <h2>1. 输入字段契约</h2>
      <form className="stack-form" onSubmit={saveSchema}>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="能力说明"
        />
        <input
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          placeholder="product_name*,color,material"
        />
        <p className="muted">加 * 表示必填。业务站漏传必填字段时 /run 会返回 400。</p>
        <button type="submit">保存契约</button>
      </form>

      <h2>2. 编写提示词（全局 / 站点覆盖）</h2>
      <form className="stack-form" onSubmit={savePrompt}>
        <label>
          作用范围
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">全局默认（所有未覆盖站点）</option>
            {data.sites.map((s) => (
              <option key={s.id} value={s.id}>
                站点覆盖：{s.code} / {s.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {siteId
            ? "保存后仅该站点走这套提示词；其他站点仍用全局或各自覆盖。"
            : "保存后作为兜底。建议始终保留一份全局默认。"}
        </p>
        <div className="chip-row">
          <span className="muted">插入变量：</span>
          {(data.task.input_schema || []).map((f) => (
            <button key={f.key} type="button" className="chip" onClick={() => insertVar(f.key)}>
              {`{{${f.key}}}`}
              {f.required ? "*" : ""}
            </button>
          ))}
        </div>
        <textarea
          rows={3}
          value={systemTemplate}
          onChange={(e) => setSystemTemplate(e.target.value)}
          placeholder="system template"
        />
        <textarea
          rows={6}
          value={userTemplate}
          onChange={(e) => setUserTemplate(e.target.value)}
          placeholder="user template"
          required
        />
        <div className="inline-form">
          <button type="submit">保存新版本并激活</button>
          <button type="button" onClick={doPreview}>
            预览渲染结果
          </button>
        </div>
      </form>

      <h2>3. 预览</h2>
      <textarea
        rows={5}
        value={previewInput}
        onChange={(e) => setPreviewInput(e.target.value)}
        className="mono"
      />
      {preview ? (
        <div className="preview-box">
          <h3>system</h3>
          <pre>{preview.system}</pre>
          <h3>user</h3>
          <pre>{preview.user}</pre>
        </div>
      ) : null}

      {msg ? <p className="ok">{msg}</p> : null}

      <h2>4. 版本历史 / 回滚</h2>
      <table>
        <thead>
          <tr>
            <th>范围</th>
            <th>版本</th>
            <th>激活</th>
            <th>更新时间</th>
            <th>user 摘要</th>
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
              <td className="mono">{p.user_template.slice(0, 60)}</td>
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

      <h2>5. 业务站调用提示</h2>
      <pre className="preview-box">{`POST /api/v1/run
Authorization: Bearer <site_token>

${JSON.stringify(
  {
    task: data.guide.business_call.task,
    input: Object.fromEntries(
      (data.task.input_schema || []).map((f) => [f.key, f.example || `<${f.key}>`]),
    ),
  },
  null,
  2,
)}`}</pre>
    </div>
  );
}
