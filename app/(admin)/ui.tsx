"use client";

import { useState, type ReactNode } from "react";

type AssistPayload = {
  task_id?: string;
  task_code?: string;
  task_name?: string;
  description?: string;
  input_schema?: Array<{ key: string; label?: string; required?: boolean; example?: string }>;
  scope?: "global" | "site";
  site_code?: string;
  site_name?: string;
  industry_hint?: string;
  existing_system?: string;
  existing_user?: string;
  mode?: "draft" | "improve";
};

export function usePromptAssist() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");

  async function assist(payload: AssistPayload) {
    setLoading(true);
    setError("");
    setNotes("");
    try {
      const res = await fetch("/api/admin/prompts/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || "AI 辅助失败");
        return null;
      }
      setNotes(data.notes || "");
      return {
        system_template: data.system_template as string,
        user_template: data.user_template as string,
        notes: (data.notes as string) || "",
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 辅助失败");
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { assist, loading, error, notes, setError };
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
