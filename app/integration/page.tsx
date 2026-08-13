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

  const handoffPrompt = `请按 AIway 接入文档完成本业务站服务端对接（Token 只放服务端，禁止 NEXT_PUBLIC_*）。

生产域名：${base}

文档：
${base}/api/docs/business-integration

SDK（下载保存为 lib/aiway-client.ts）：
${base}/sdk/aiway-client.ts

可视化说明页：
${base}/integration

环境变量：
AI_SCHEDULER_URL=${base}/api/v1
AI_SCHEDULER_TOKEN=<向管理员索取>

Open API：
POST ${base}/api/v1/run
GET  ${base}/api/v1/account
GET  ${base}/api/v1/usage

实现要求：
1) 用官方 SDK（runTaskJson / getAccount / runRawJson 等），不要手写半截 fetch
2) 先 GET /account 探活，确认 status=active 与 balance
3) 若只用 Raw（不写任务）：确认 modes.can_use_raw=true，用 runRaw / runRawJson，请求必须带 mode:"raw" 和 model_id
4) 若用 Task：runTaskJson({ task:"ping", input:{ message:"hi" } })，再接预置能力
5) 解析优先用 output_json 或 runTaskJson / runRawJson（兼容 markdown 代码块），禁止只 JSON.parse(output_text)
6) 错误用 AiwayError 处理；402 提示充值；403 检查模式开关或站点停用`;

  return (
    <main className="page" style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
      <p className="muted">
        <Link href="/">← AIway</Link>
      </p>
      <h1>业务网站接入</h1>
      <p className="muted">
        生产域名 <a href={base}>{base}</a>。给业务站 / 另一个 Cursor 项目直接使用的对接材料。
      </p>

      <div className="tip tip-ok" style={{ marginTop: 16 }}>
        <strong>给另一个 Cursor 对话直接用</strong>
        <div className="tip-body">
          <p>把下面整段提示词粘贴到业务站项目的 Cursor 里：</p>
          <pre className="preview-box">{handoffPrompt}</pre>
          <p>
            Open API： <a href={`${base}/api/v1`}>{base}/api/v1</a>
            <br />
            原始文档：{" "}
            <a href="/api/docs/business-integration">/api/docs/business-integration</a>
            <br />
            SDK： <a href="/sdk/aiway-client.ts">/sdk/aiway-client.ts</a>
            <br />
            交接说明：见仓库 <code>docs/CURSOR-HANDOFF.md</code>
          </p>
        </div>
      </div>

      <div className="tip" style={{ marginTop: 14 }}>
        <strong>双模式速览</strong>
        <div className="tip-body">
          <p>
            <b>Task</b>：传 <code>task</code> + <code>input</code>，提示词在 AIway 后台。
          </p>
          <p>
            <b>Raw</b>：传 <code>mode:&quot;raw&quot;</code> + <code>model_id</code> +{" "}
            <code>prompt</code>，需管理员开全局 Raw 与站点 Raw；先看{" "}
            <code>GET /account</code> 的 <code>modes.can_use_raw</code>。
          </p>
          <p>
            解析请优先 <code>output_json</code> / SDK <code>runTaskJson</code>，不要只{" "}
            <code>JSON.parse(output_text)</code>。
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
