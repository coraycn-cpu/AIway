"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/dashboard", label: "仪表盘" },
  { href: "/sites", label: "站点" },
  { href: "/accounts", label: "账号/充值" },
  { href: "/tokens", label: "Token" },
  { href: "/tasks", label: "任务" },
  { href: "/prompts", label: "提示词" },
  { href: "/models", label: "模型目录" },
  { href: "/logs", label: "调用日志" },
  { href: "/docs", label: "系统说明" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        <div className="brand">AIway</div>
        <p className="brand-sub">AI 用量调度</p>
        <nav>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname.startsWith(l.href) ? "nav-link active" : "nav-link"}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="logout-btn" onClick={logout}>
          退出登录
        </button>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
