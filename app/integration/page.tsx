import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";
import { PUBLIC_APP_ORIGIN } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default function IntegrationPage() {
  const md = readFileSync(
    join(process.cwd(), "docs/BUSINESS-SITE-INTEGRATION.md"),
    "utf8",
  );
  const base = PUBLIC_APP_ORIGIN;

  const handoffPrompt = `按 ${base}/api/docs/business-integration 在服务端对接 AIway。
下载 SDK：${base}/sdk/aiway-client.ts → lib/aiway-client.ts
环境变量（禁止 NEXT_PUBLIC_*）：
AI_SCHEDULER_URL=${base}/api/v1
AI_SCHEDULER_TOKEN=<sk_xxx>`;

  return (
    <main className="page" style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
      <p className="muted">
        <Link href="/">← AIway</Link>
      </p>
      <h1>业务网站接入</h1>
      <p className="muted">
        生产域名 <a href={base}>{base}</a>。下面是给业务站 AI 写代码用的接口说明。
      </p>

      <div className="tip tip-ok" style={{ marginTop: 16 }}>
        <strong>给另一个 Cursor 对话直接用</strong>
        <div className="tip-body">
          <p>把下面整段提示词粘贴到业务站项目的 Cursor 里：</p>
          <pre className="preview-box">{handoffPrompt}</pre>
          <p>
            文档：{" "}
            <a href="/api/docs/business-integration">/api/docs/business-integration</a>
            {" · "}
            SDK： <a href="/sdk/aiway-client.ts">/sdk/aiway-client.ts</a>
            {" · "}
            API： <a href={`${base}/api/v1`}>{base}/api/v1</a>
          </p>
        </div>
      </div>

      <article className="panel" style={{ marginTop: 18 }}>
        <div className="panel-body">
          <pre
            style={{
              whiteSpace: "pre-wrap",
              margin: 0,
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: "0.86rem",
              lineHeight: 1.55,
            }}
          >
            {md}
          </pre>
        </div>
      </article>
    </main>
  );
}
