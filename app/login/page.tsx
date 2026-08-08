"use client";

import { Suspense, FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("admin@qq.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error?.message || "登录失败");
      return;
    }
    router.push(params.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <h1>AIway 管理后台</h1>
      <p>开户 · Token · 提示词 · 计费调度</p>
      <label>
        邮箱
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      </label>
      <label>
        密码
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />
      </label>
      {error ? <div className="error">{error}</div> : null}
      <button type="submit" disabled={loading}>
        {loading ? "登录中..." : "登录"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-page">
      <Suspense fallback={<div className="login-card">加载中...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
