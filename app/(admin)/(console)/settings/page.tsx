"use client";

import { useEffect, useState } from "react";
import { Tip } from "../../tip";
import { Field, Panel } from "../../ui";

type ModeSettings = {
  raw_mode_enabled: boolean;
  task_mode_enabled: boolean;
  rate_limit_per_minute: number;
  tip?: string;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<ModeSettings | null>(null);
  const [rateInput, setRateInput] = useState("120");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    if (res.ok) {
      setSettings(data);
      setRateInput(String(data.rate_limit_per_minute ?? 120));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(next: Partial<ModeSettings>) {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(data?.error?.message || "保存失败");
      return;
    }
    setSettings(data);
    setRateInput(String(data.rate_limit_per_minute ?? 120));
    setMsg(data.tip || "已保存");
  }

  async function saveRate() {
    const n = Number(rateInput);
    if (!Number.isFinite(n) || n < 1 || n > 6000 || !Number.isInteger(n)) {
      setMsg("限流须为 1–6000 的整数（次/分钟）");
      return;
    }
    await patch({ rate_limit_per_minute: n });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>运行模式</h1>
          <p className="muted">全局开关控制 Task / Raw 双模式；站点还需单独开 Raw。</p>
        </div>
      </div>

      <Tip title="双模式怎么开">
        <p>
          <b>Task</b>：业务站只传 <code>task</code> + <code>input</code>，提示词由 AIway 管理。
        </p>
        <p>
          <b>Raw</b>：业务站自带 <code>model_id</code> / <code>system</code> / <code>prompt</code>，仍走
          AIway 鉴权与扣费。需同时打开：全局 Raw + 该站点 <code>raw_enabled</code>。
        </p>
      </Tip>

      <Panel title="全局开关" subtitle={settings?.tip}>
        {!settings ? (
          <p className="muted">加载中…</p>
        ) : (
          <div className="form-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.task_mode_enabled}
                disabled={saving}
                onChange={(e) => patch({ task_mode_enabled: e.target.checked })}
              />
              <span>
                <b>Task 模式</b>
                <span className="muted small"> — 默认开启。关闭后所有站点无法调 task 契约。</span>
              </span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.raw_mode_enabled}
                disabled={saving}
                onChange={(e) => patch({ raw_mode_enabled: e.target.checked })}
              />
              <span>
                <b>Raw 模式（全局）</b>
                <span className="muted small">
                  {" "}
                  — 默认关闭。开启后，还要到「站点」列表给具体站点打开 Raw。
                </span>
              </span>
            </label>
            <Field
              label="站点限流（次/分钟）"
              hint="每个 API Token 所属站点的软限流；超出返回 429 + Retry-After。默认 120。"
            >
              <div className="inline-form">
                <input
                  type="number"
                  min={1}
                  max={6000}
                  step={1}
                  value={rateInput}
                  disabled={saving}
                  onChange={(e) => setRateInput(e.target.value)}
                />
                <button type="button" disabled={saving} onClick={saveRate}>
                  保存限流
                </button>
              </div>
            </Field>
            {msg ? <p className="ok">{msg}</p> : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
