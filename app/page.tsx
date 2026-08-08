import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-hero">
      <div>
        <h1>AIway</h1>
        <p>
          多业务站 AI 调用中台。开户、发 Token、充值、配置任务提示词，业务站通过 Bearer Token
          调用并自查余额与用量。上游固定走 Vercel AI Gateway。
        </p>
        <Link href="/login">进入管理后台</Link>
      </div>
    </main>
  );
}
