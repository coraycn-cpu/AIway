import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-hero">
      <div>
        <h1>AIway</h1>
        <p>
          多业务站 AI 调用中台。先定任务能力，再配全局/站点提示词；业务站只传 task +
          字段。服装与五金等行业差异，优先用同一 task 的站点提示词覆盖。
        </p>
        <Link href="/login">进入管理后台</Link>
      </div>
    </main>
  );
}
