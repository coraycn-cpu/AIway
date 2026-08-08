"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Tip } from "../../tip";
import { Field, Panel, usePromptAssist } from "../../ui";

type Task = {
  id: string;
  task_code: string;
  name: string;
  description?: string | null;
  input_schema?: Array<{ key: string; required?: boolean; label?: string; example?: string }>;
  has_global_prompt?: boolean;
};
type Site = { id: string; code: string; name: string };
type Prompt = {
  id: string;
  task_id: string;
  task_code: string;
  site_code: string | null;
  version: number;
  is_active: boolean;
  user_template: string;
};

export default function PromptsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [items, setItems] = useState<Prompt[]>([]);
  const [taskId, setTaskId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [industryHint, setIndustryHint] = useState("");
  const [systemTemplate, setSystemTemplate] = useState("");
  const [userTemplate, setUserTemplate] = useState("");
  const [msg, setMsg] = useState("");
  const { assist, loading, error, notes } = usePromptAssist();

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === taskId) || null,
    [tasks, taskId],
  );
  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) || null,
    [sites, siteId],
  );

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

  function fillExample() {
    setSystemTemplate("你是资深电商文案助手。根据商品信息输出简洁、可上架的描述，不要编造规格。");
    setUserTemplate(
      "商品名称：{{product_name}}\n颜色：{{color}}\n材质：{{material}}\n请输出：1) 一句话卖点 2) 80-120字详情。",
    );
    setIndustryHint(siteId ? "按该站点行业语气优化" : "通用电商商品描述");
  }

  async function runAssist(mode: "draft" | "improve") {
    if (!selectedTask) return;
    const result = await assist({
      task_id: selectedTask.id,
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
    setMsg(mode === "draft" ? "AI 已生成草稿，请检查后保存" : "AI 已优化当前草稿，请检查后保存");
  }

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
    setMsg(siteId ? "已激活站点覆盖提示词" : "已激活全局默认提示词");
    load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>提示词管理</h1>
          <p className="muted">快捷编辑入口；完整预览/回滚请用任务详情页。</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={fillExample}>
            填入示例
          </button>
          {selectedTask ? (
            <Link className="link-btn" href={`/tasks/${selectedTask.id}`}>
              打开任务详情
            </Link>
          ) : null}
        </div>
      </div>

      <Tip title="提示词只决定「怎么说」，不改变 task 名">
        <p>同一任务可先写全局默认，再为服装站/五金站分别覆盖。</p>
      </Tip>

      <div className="layout-2">
        <Panel title="编写提示词" subtitle="支持示例填充与 AI 辅助">
          <form className="form-grid" onSubmit={onCreate}>
            <Field label="任务能力">
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)} required>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.task_code} / {t.name}
                    {!t.has_global_prompt ? "（缺全局）" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="作用范围"
              hint="全局默认给所有未覆盖站点；站点覆盖只影响选中站。"
            >
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">全局默认</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    站点覆盖：{s.code} / {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="行业/风格提示（给 AI 辅助用）"
              hint="示例：服装站，强调面料版型与穿搭场景"
            >
              <input
                value={industryHint}
                onChange={(e) => setIndustryHint(e.target.value)}
                placeholder="例如：五金站，强调规格、承重、安装注意"
              />
            </Field>

            {selectedTask?.input_schema?.length ? (
              <div className="chip-row">
                <span className="muted">插入变量：</span>
                {selectedTask.input_schema.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className="chip"
                    onClick={() => setUserTemplate((v) => `${v}{{${f.key}}}`)}
                  >
                    {`{{${f.key}}}`}
                    {f.required ? "*" : ""}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">该任务还没字段契约，建议先到任务详情补充。</p>
            )}

            <Field
              label="system 模板"
              hint="示例：你是资深电商文案助手，不要编造规格。"
            >
              <textarea
                rows={4}
                value={systemTemplate}
                onChange={(e) => setSystemTemplate(e.target.value)}
                placeholder="你是资深电商文案助手。根据商品信息输出简洁可上架描述，不要编造规格。"
              />
            </Field>
            <Field
              label="user 模板"
              hint="示例：商品名称：{{product_name}} ... 请输出卖点与详情。"
            >
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
              <button type="submit" disabled={!userTemplate.trim()}>
                保存并激活
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
            {notes ? <p className="muted">AI 说明：{notes}</p> : null}
            {msg ? <p className="ok">{msg}</p> : null}
          </form>
        </Panel>

        <Panel title="已保存版本" subtitle="仅展示摘要；回滚请到任务详情">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>范围</th>
                  <th>版本</th>
                  <th>激活</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/tasks/${p.task_id}`}>{p.task_code}</Link>
                    </td>
                    <td>{p.site_code || "全局"}</td>
                    <td>v{p.version}</td>
                    <td>{p.is_active ? "是" : "否"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
