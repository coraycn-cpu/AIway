export default function DocsPage() {
  return (
    <div className="page">
      <h1>系统说明</h1>
      <p className="muted">上游固定为 Vercel AI Gateway；原始厂商 Key 不在本系统管理。</p>
      <ul className="doc-list">
        <li>
          管理端：账号密码登录后台，负责开户、发 Token、充值、配置任务/提示词、查看全局日志。
        </li>
        <li>
          业务站：服务端持有 <code>Authorization: Bearer &lt;token&gt;</code>，调用{" "}
          <code>/api/v1/run</code>、<code>/account</code>、<code>/usage</code>。
        </li>
        <li>
          环境变量：<code>DATABASE_URL</code>、<code>AI_GATEWAY_API_KEY</code>、
          <code>ADMIN_SESSION_SECRET</code>。
        </li>
        <li>提示词只在后台维护；业务站只传 task + 业务字段。</li>
        <li>余额/额度不足会直接拒绝，不调上游；成功/失败都会写 usage_logs。</li>
      </ul>
    </div>
  );
}
