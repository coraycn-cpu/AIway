import type { ReactNode } from "react";

export function Tip({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "warn" | "ok";
}) {
  return (
    <div className={`tip tip-${tone}`}>
      <strong>{title}</strong>
      <div className="tip-body">{children}</div>
    </div>
  );
}
