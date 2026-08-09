import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function IntegrationPage() {
  const md = readFileSync(
    join(process.cwd(), "docs/BUSINESS-SITE-INTEGRATION.md"),
    "utf8",
  );

  return (
    <main className="page" style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
      <p className="muted">
        <Link href="/">← AIway</Link>
      </p>
      <h1>业务网站接入</h1>
      <p className="muted">给业务站 / 另一个 Cursor 项目直接使用的对接材料。</p>

      <div className="tip tip-ok" style={{ marginTop: 16 }}>
        <strong>给另一个 Cursor 对话直接用</strong>
        <div className="tip-body">
          <p>把下面整段提示词粘贴到业务站项目的 Cursor 里：</p>
          <pre className="preview-box">{`请按 AIway 接入文档完成本业务站服务端对接（Token 只放服务端）。

文档（Markdown）：
${typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/docs/business-integration`
  : "https://<aiway-host>/api/docs/business-integration"}

客户端 SDK（可下载到 lib/aiway-client.ts）：
${typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/sdk/aiway-client.ts`
  : "https://<aiway-host>/sdk/aiway-client.ts"}

环境变量：
AI_SCHEDULER_URL=https://<aiway-host>/api/v1
AI_SCHEDULER_TOKEN=<向管理员索取>

先实现：
1) 拷贝 SDK 到服务端
2) GET /account 探活
3) POST /run task=ping
4) 再接 apparel_image_enrich 或 blog_topic_recommend / blog_seo_article
不要把 Token 暴露到前端。`}</pre>
          <p>
            原始文档 API：{" "}
            <a href="/api/docs/business-integration">/api/docs/business-integration</a>
            <br />
            SDK 文件： <a href="/sdk/aiway-client.ts">/sdk/aiway-client.ts</a>
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
