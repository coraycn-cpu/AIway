import { Tip } from "../../tip";

export default function DocsPage() {
  return (
    <div className="page">
      <h1>系统说明</h1>
      <p className="muted">上游固定为 Vercel AI Gateway；原始厂商 Key 不在本系统管理。</p>

      <Tip title="核心模型：Task / Prompt / Site">
        <ol>
          <li>
            <b>Task（任务）</b>：能力名与输入字段契约。业务站只认 <code>task_code</code>。
          </li>
          <li>
            <b>Prompt（提示词）</b>：决定怎么执行。先配全局默认，再按站点覆盖。
          </li>
          <li>
            <b>Site（站点）</b>：谁在调用、花谁的钱。不拥有任务，只调用任务。
          </li>
        </ol>
        <p>
          服装站与五金站：优先共用同一 task（如 <code>product_desc</code>），分别做站点提示词覆盖。
        </p>
      </Tip>

      <ul className="doc-list">
        <li>
          管理端：账号密码登录后台，负责开户、发 Token、充值、配置任务/提示词、查看全局日志。
        </li>
        <li>
          业务站：服务端持有 <code>Authorization: Bearer &lt;token&gt;</code>，调用{" "}
          <code>/api/v1/run</code>、<code>/account</code>、<code>/usage</code>。
        </li>
        <li>
          环境变量：<code>DATABASE_URL</code>/<code>POSTGRES_URL</code>、
          <code>AI_GATEWAY_API_KEY</code>、<code>ADMIN_SESSION_SECRET</code>。
        </li>
        <li>提示词只在后台维护；业务站只传 task + 业务字段。</li>
        <li>解析顺序：站点专属激活提示词 → 全局默认激活提示词。</li>
        <li>余额/额度不足会直接拒绝，不调上游；成功/失败都会写 usage_logs。</li>
      </ul>
    </div>
  );
}
