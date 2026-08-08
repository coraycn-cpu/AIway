# AIway — AI 用量调度管理系统（V1）

多业务站 AI 调用中台：开户 / Token / 提示词 / 计费 / 用量查询。上游固定走 **Vercel AI Gateway**。

## 默认管理员

- 邮箱：`admin@qq.com`
- 密码：`123456`

（首次执行数据库迁移后可用）

## 技术栈

- Next.js App Router（部署到 Vercel）
- Postgres（Supabase / Neon 等）
- Vercel AI Gateway + AI SDK
- 管理端 Session Cookie；业务站 Bearer Token

## 环境变量

复制 `.env.example`，在 Vercel Project Settings → Environment Variables 中配置：

```text
# 若已接 Vercel 内置 Supabase，通常已有 POSTGRES_URL，可不再单独加 DATABASE_URL
DATABASE_URL=postgresql://...
AI_GATEWAY_API_KEY=...
ADMIN_SESSION_SECRET=请换成足够长的随机串
```

Vercel ↔ Supabase 集成常见变量：`POSTGRES_URL`、`POSTGRES_URL_NON_POOLING` 等。应用会自动回退读取 `POSTGRES_URL`。

## 数据库迁移

在已配置 `DATABASE_URL` / `POSTGRES_URL` 的环境执行：

```bash
npm run db:migrate
```

或在 Supabase SQL Editor 中按文件名顺序执行：

1. `supabase/migrations/001_init.sql`
2. `supabase/migrations/002_task_input_schema.sql`

会创建全部表，并写入管理员、默认模型、示例任务 `ping`。

## 管理后台

- `/login` 登录
- `/dashboard` 仪表盘
- `/sites` 开户/站点
- `/accounts` 充值与流水
- `/tokens` Token（明文仅创建时显示一次）
- `/tasks` 任务
- `/prompts` 提示词（站点专属 → 全局默认）
- `/models` 模型对客户售价（含 DeepSeek / Gemini；可一键同步）
- `/logs` 全局调用日志

## 业务站 Open API

统一前缀：`/api/v1`  
鉴权：`Authorization: Bearer <site_token>`

### 调 AI

`POST /api/v1/run`

```json
{
  "task": "ping",
  "input": { "message": "hello" },
  "trace_id": "optional"
}
```

### 查余额

`GET /api/v1/account`

### 查用量

`GET /api/v1/usage?page=1&page_size=20`  
`GET /api/v1/usage/{request_id}`

### 业务站环境变量

```text
AI_SCHEDULER_URL=https://<your-app>.vercel.app/api/v1
AI_SCHEDULER_TOKEN=sk_xxx
```

### 对接示例

```ts
const base = process.env.AI_SCHEDULER_URL!
const token = process.env.AI_SCHEDULER_TOKEN!

await fetch(`${base}/run`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    task: "ping",
    input: { message: "hello" },
  }),
})

await fetch(`${base}/account`, {
  headers: { Authorization: `Bearer ${token}` },
})

await fetch(`${base}/usage?page=1`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

## Vercel 部署步骤

1. 将本仓库导入 Vercel
2. 配置上述三个环境变量
3. Deploy
4. 对线上 `DATABASE_URL` 执行 `npm run db:migrate`（可用 Vercel CLI / 本地一次性跑）
5. 打开 `https://<app>.vercel.app/login` 用管理员账号登录
6. 创建测试站点 → 发 Token → 充值 → 用 curl 打通 `/run`

## 核心规则

1. 提示词只在调度后台维护；业务站只传 `task` + 业务字段
2. 余额/额度不足 → 直接拒绝，不调上游
3. 成功/失败都写 `usage_logs`
4. Token 明文仅创建时显示一次
5. 业务站查询接口只能读自己的数据
6. V1 不自建多厂商原始 Key 管理页
