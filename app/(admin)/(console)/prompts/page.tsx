"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Tip } from "../../tip";

type Task = {
  id: string;
  task_code: string;
  name: string;
  input_schema?: Array<{ key: string; required?: boolean }>;
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

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === taskId) || null,
    [tasks, taskId],
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
    setMsg(
      siteId
        ? "已激活站点覆盖。该站调用此 task 时优先用这套提示词。"
        : "已激活全局默认。未覆盖站点都会使用它。",
    );
    load();
  }

  return (
    <div className="page">
      <h1>提示词管理</h1>
      <Tip title="提示词不定义能力，任务才定义能力">
        <p>
          先在「任务」里定 <code>task_code</code> 与输入字段；这里只决定「怎么说」。
          服装/五金差异：选同一任务，再选不同站点做覆盖。
        </p>
        <p>
          更完整的编排（预览、回滚、覆盖一览）请进入{" "}
          {selectedTask ? (
            <Link href={`/tasks/${selectedTask.id}`}>任务详情页</Link>
          ) : (
            <Link href="/tasks">任务管理</Link>
          )}
          。
        </p>
      </Tip>

      <form className="stack-form" onSubmit={onCreate}>
        <label>
          任务能力
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} required>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.task_code} / {t.name}
                {!t.has_global_prompt ? "（缺全局提示词）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          作用范围
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">全局默认</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                站点覆盖：{s.code} / {s.name}
              </option>
            ))}
          </select>
        </label>
        {selectedTask?.input_schema?.length ? (
          <div className="chip-row">
            <span className="muted">可用变量：</span>
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
          <p className="muted">该任务尚未声明输入字段，建议先到任务详情补充契约。</p>
        )}
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
              <td>
                <Link href={`/tasks/${p.task_id}`}>{p.task_code}</Link>
              </td>
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
