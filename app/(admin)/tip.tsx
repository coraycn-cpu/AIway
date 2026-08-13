"use client";

import { useState, type ReactNode } from "react";

export function Tip({
  title,
  children,
  tone = "info",
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "warn" | "ok";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`tip tip-${tone}`}>
      <button type="button" className="tip-toggle" onClick={() => setOpen((v) => !v)}>
        <strong>{title}</strong>
        <span>{open ? "收起" : "展开说明"}</span>
      </button>
      {open ? <div className="tip-body">{children}</div> : null}
    </div>
  );
}
