"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Tip } from "../../tip";
import { Field, Panel } from "../../ui";
import {
  ListTableShell,
  ListToolbar,
  Pagination,
  useDebouncedValue,
  usePagedList,
} from "../../list-ui";
import { invalidateAdminOptions } from "../../options-cache";

type Model = {
  id: string;
  model_id: string;
  display_name: string;
  input_price_per_1m: string;
  output_price_per_1m: string;
  enabled: boolean;
};

const emptyForm = {
  model_id: "",
  display_name: "",
  input_price_per_1m: "0.3",
  output_price_per_1m: "2.5",
};

function providerOf(modelId: string) {
  const p = modelId.split("/")[0] || "other";
  if (p === "google") return "Gemini / Google";
  if (p === "deepseek") return "DeepSeek";
  if (p === "openai") return "OpenAI";
  if (p === "anthropic") return "Anthropic";
  return p;
}

export default function ModelsPage() {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [enabled, setEnabled] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const formRef = useRef<HTMLFormElement | null>(null);

  const list = usePagedList<Model>(
    "/api/admin/models",
    {
      q: debouncedQ,
      provider,
      enabled,
    },
    { defaultPageSize: 50 },
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const m of list.items) {
      const key = providerOf(m.model_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()];
  }, [list.items]);

  useEffect(() => {
    if (!editingId) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingId]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function fillExample(kind: "deepseek" | "gemini") {
    setEditingId(null);
    setError("");
    if (kind === "deepseek") {
      setForm({
        model_id: "deepseek/deepseek-v4-flash",
        display_name: "DeepSeek V4 Flash",
        input_price_per_1m: "0.05",
        output_price_per_1m: "0.10",
      });
    } else {
      setForm({
        model_id: "google/gemini-2.5-flash",
        display_name: "Gemini 2.5 Flash",
        input_price_per_1m: "0.30",
        output_price_per_1m: "2.50",
      });
    }
  }

  function startEdit(m: Model) {
    setEditingId(m.id);
    setMsg("");
    setError("");
    setForm({
      model_id: m.model_id,
      display_name: m.display_name,
      input_price_per_1m: String(m.input_price_per_1m ?? ""),
      output_price_per_1m: String(m.output_price_per_1m ?? ""),
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setError("");

    const inputPrice = Number(form.input_price_per_1m);
    const outputPrice = Number(form.output_price_per_1m);
    if (!Number.isFinite(inputPrice) || inputPrice < 0 || !Number.isFinite(outputPrice) || outputPrice < 0) {
      setSaving(false);
      setError("价格须为非负数字");
      return;
    }

    try {
      if (editingId) {
        const res = await fetch("/api/admin/models", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            display_name: form.display_name,
            input_price_per_1m: inputPrice,
            output_price_per_1m: outputPrice,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error?.message || "更新失败");
          return;
        }
        invalidateAdminOptions(["models"]);
        setMsg(`已更新售价：${form.model_id}`);
        resetForm();
        list.reload();
      } else {
        const res = await fetch("/api/admin/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_id: form.model_id,
            display_name: form.display_name,
            input_price_per_1m: inputPrice,
            output_price_per_1m: outputPrice,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error?.message || "保存失败");
          return;
        }
        invalidateAdminOptions(["models"]);
        setMsg("模型已保存（对客户售价）");
        resetForm();
        list.reload();
      }
    } finally {
      setSaving(false);
    }
  }

  async function seedDefaults() {
    setSeeding(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/admin/models/seed", { method: "POST" });
    const data = await res.json();
    setSeeding(false);
    if (!res.ok) {
      setError(data?.error?.message || "同步失败");
      return;
    }
    setMsg(data.tip || `已同步 ${data.upserted} 个模型`);
    invalidateAdminOptions(["models"]);
    list.reload();
  }

  async function toggle(id: string, isEnabled: boolean) {
    await fetch("/api/admin/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !isEnabled }),
    });
    list.reload();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>模型目录</h1>
          <p className="muted">
            model_id 使用 Vercel AI Gateway 格式（如 deepseek/...、google/gemini-...）。
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" disabled={seeding} onClick={seedDefaults}>
            {seeding ? "同步中..." : "一键同步 DeepSeek/Gemini 等"}
          </button>
        </div>
      </div>

      <Tip title="上游 Key 不用在这里管">
        <p>
          本页只维护对客户售价与是否启用。实际调用走 AI Gateway；请确保 Gateway
          已开通对应模型权限。
        </p>
        <p>
          改价：在列表点「编辑」，改输入/输出价后保存。新调用按新价计费，历史流水不变。
        </p>
      </Tip>

      <Panel
        title={editingId ? "编辑模型售价" : "新增 / 更新模型"}
        subtitle={
          editingId
            ? `正在编辑：${form.model_id}（model_id 不可改；要换 ID 请新增）`
            : "已存在的 model_id 会更新名称与售价；也可从列表点「编辑」"
        }
      >
        <form className="form-grid" onSubmit={onSave} ref={formRef}>
          {!editingId ? (
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => fillExample("deepseek")}>
                填入 DeepSeek 示例
              </button>
              <button type="button" className="btn-secondary" onClick={() => fillExample("gemini")}>
                填入 Gemini 示例
              </button>
            </div>
          ) : null}
          <div className="form-row-2">
            <Field
              label="model_id"
              hint={
                editingId
                  ? "编辑时锁定，避免误改计费标识"
                  : "示例：deepseek/deepseek-v4-flash 或 google/gemini-2.5-flash"
              }
            >
              <input
                value={form.model_id}
                onChange={(e) => setForm({ ...form, model_id: e.target.value })}
                placeholder="google/gemini-2.5-flash"
                required
                disabled={Boolean(editingId)}
                className={editingId ? "mono" : undefined}
              />
            </Field>
            <Field label="显示名" hint="示例：Gemini 2.5 Flash">
              <input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Gemini 2.5 Flash"
                required
              />
            </Field>
          </div>
          <div className="form-row-2">
            <Field label="输入价 / 1M tokens" hint="对客户售价（USD）">
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.input_price_per_1m}
                onChange={(e) => setForm({ ...form, input_price_per_1m: e.target.value })}
                required
              />
            </Field>
            <Field label="输出价 / 1M tokens" hint="对客户售价（USD）">
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.output_price_per_1m}
                onChange={(e) => setForm({ ...form, output_price_per_1m: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "保存中…" : editingId ? "保存改价" : "保存模型"}
            </button>
            {editingId ? (
              <button type="button" className="btn-secondary" onClick={resetForm} disabled={saving}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
        {msg ? <p className="ok">{msg}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </Panel>

      <Panel title="模型目录">
        <ListToolbar onRefresh={list.reload} loading={list.busy}>
          <input
            className="list-search"
            type="search"
            placeholder="搜索 model_id / 显示名"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">全部厂商</option>
            <option value="deepseek">DeepSeek</option>
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
          <select value={enabled} onChange={(e) => setEnabled(e.target.value)}>
            <option value="">启用状态</option>
            <option value="true">已启用</option>
            <option value="false">已停用</option>
          </select>
        </ListToolbar>
        {list.error ? <p className="error">{list.error}</p> : null}
        <ListTableShell loading={list.loading} refreshing={list.refreshing} bare>
          {list.items.length === 0 ? (
            <p className="muted">{list.loading ? "加载中…" : "暂无模型"}</p>
          ) : (
            grouped.map(([group, rows]) => (
              <div key={group} style={{ marginBottom: 18 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>{group}</h3>
                <div className="table-wrap">
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
                      {rows.map((m) => (
                        <tr
                          key={m.id}
                          className={editingId === m.id ? "row-selected" : undefined}
                        >
                          <td className="mono">{m.model_id}</td>
                          <td>{m.display_name}</td>
                          <td>{m.input_price_per_1m}</td>
                          <td>{m.output_price_per_1m}</td>
                          <td>{m.enabled ? "是" : "否"}</td>
                          <td>
                            <div className="inline-form">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => startEdit(m)}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => toggle(m.id, m.enabled)}
                              >
                                {m.enabled ? "停用" : "启用"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
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
