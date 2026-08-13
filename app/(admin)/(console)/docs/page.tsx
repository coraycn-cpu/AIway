import { Tip } from "../../tip";

export default function DocsPage() {
  return (
    <div className="page">
      <h1>系统说明</h1>
      <p className="muted">上游固定为 Vercel AI Gateway；原始厂商 Key 不在本系统管理。</p>

      <Tip title="核心模型：Task / Prompt / Site / Raw" defaultOpen>
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
          <li>
            <b>Raw</b>：业务站自带 model + prompt，仍走鉴权扣费。需「运行模式」全局开 Raw + 站点开
            Raw。
          </li>
        </ol>
      </Tip>

      <Tip title="预置能力（任务页可一键同步）" defaultOpen>
        <ol>
          <li>
            <code>apparel_image_enrich</code>：上传服装/面料图 → 补全英文商品字段与简述（支持{" "}
            <code>image_url</code> 视觉分析）。
          </li>
          <li>
            <code>blog_topic_recommend</code>：按网站主题 + 目标人群推荐 SEO/GEO 友好英文选题。
          </li>
          <li>
            <code>blog_seo_article</code>：按选题生成英文成稿，含 FAQ、站内内链、meta。
          </li>
        </ol>
        <p>推荐流程：选题 → 选定 topic → 成稿；服装站可对同一 task 做站点提示词覆盖。</p>
      </Tip>

      <ul className="doc-list">
        <li>
          管理端：账号密码登录后台，负责开户、发 Token、充值、配置任务/提示词、查看全局日志。
        </li>
        <li>
          业务站：服务端持有 <code>Authorization: Bearer &lt;token&gt;</code>，调用{" "}
          <code>https://www.ryfs.cn/api/v1/run</code>、<code>/account</code>、<code>/usage</code>。
        </li>
        <li>
          业务接入文档：
          <a href="https://www.ryfs.cn/integration">https://www.ryfs.cn/integration</a>
          ；Markdown{" "}
          <a href="https://www.ryfs.cn/api/docs/business-integration">
            /api/docs/business-integration
          </a>
          ；SDK{" "}
          <a href="https://www.ryfs.cn/sdk/aiway-client.ts">/sdk/aiway-client.ts</a>。
        </li>
        <li>
          环境变量：<code>DATABASE_URL</code>/<code>POSTGRES_URL</code>、
          <code>AI_GATEWAY_API_KEY</code>、<code>ADMIN_SESSION_SECRET</code>。
        </li>
        <li>提示词默认在后台维护（Task）；也可开 Raw 让业务站自带提示词。</li>
        <li>解析顺序：站点专属激活提示词 → 全局默认激活提示词。</li>
        <li>图片字段支持：<code>image_url</code> / <code>image_urls</code>（需选视觉模型）。</li>
        <li>余额/额度不足会直接拒绝，不调上游；成功/失败都会写 usage_logs。</li>
        <li>
          双模式开关：侧栏「运行模式」控制全局 Task/Raw；「站点」列表可按站开 Raw。
        </li>
        <li>
          业务站解析优先 <code>output_json</code> / SDK <code>runTaskJson</code>，兼容 markdown
          代码块。
        </li>
      </ul>
    </div>
  );
}
