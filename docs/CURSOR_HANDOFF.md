# AIway 会话交接文档

> 清理 Cloud Agent 会话前的状态快照。  
> 生成日期：2026-09-11  
> 权威代码：`origin/main` @ `a606c0a`（含 PR #1–#5）  
> 仓库：https://github.com/coraycn-cpu/AIway  
> 生产：https://www.ryfs.cn

**注意：** 同目录另有 `docs/CURSOR-HANDOFF.md`（短横线），那是给**业务站**粘贴的对接提示词，不是本文件。本文件（下划线）给**后续 Cursor / Cloud Agent** 继续改本仓库用。

---

## 1. 目标

把 AIway 做成多业务站共用的 **AI 用量调度中台**：

1. 管理端开户、发 Token、充值、配任务/提示词/模型售价
2. 业务站只拿 `sk_...` 调 Open API；Task 模式提示词在中台，Raw / OpenAI 兼容模式可自带 prompt/model
3. 上游固定走 **Vercel AI Gateway**；成功/失败都记账；余额不足拒调
4. V1 不自建多厂商原始 Key 管理页

近期加固目标（已合入 main）：

- 去掉 Open API 热路径 DDL
- 调用前余额预扣（`held_balance`）
- 站点级限流、Idempotency-Key、上游重试
- `GET /models`、chat SSE、图片 SSRF 防护、图模最低价
- 生产忘跑迁移时的 schema 自动补齐

---

## 2. 技术选型

| 层 | 选型 |
|----|------|
| 框架 | Next.js 16 App Router（注意：本仓库 Next 与常规训练数据不同，改前先看 `node_modules/next/dist/docs/`） |
| UI | React 19 + Tailwind 4 |
| 部署 | Vercel |
| DB | Postgres（Supabase / Neon）；`postgres` 驱动；迁移 SQL 在 `supabase/migrations/` |
| ORM | Drizzle 在依赖里，热路径多用手写 SQL |
| AI | `ai` + `@ai-sdk/gateway` → Vercel AI Gateway |
| 管理鉴权 | Session Cookie + `jose`（`ADMIN_SESSION_SECRET`） |
| 业务鉴权 | Bearer Token（`sk_...`，库内存 hash） |
| 校验 | Zod 4 |
| SDK | `public/sdk/aiway-client.ts`（生产 URL：`/sdk/aiway-client.ts`） |

### 环境变量

```text
DATABASE_URL=...          # 或 POSTGRES_URL / POSTGRES_URL_NON_POOLING
AI_GATEWAY_API_KEY=...
ADMIN_SESSION_SECRET=...
```

### 生产入口

| 用途 | URL |
|------|-----|
| 管理登录 | https://www.ryfs.cn/login |
| Open API Base | https://www.ryfs.cn/api/v1 |
| 业务对接文档 | https://www.ryfs.cn/api/docs/business-integration |
| SDK | https://www.ryfs.cn/sdk/aiway-client.ts |

种子管理员（迁移后）：`admin@qq.com` / `123456`（生产若已改密以实际为准）。

### 迁移（务必按序）

1. `001_init.sql`
2. `002_task_input_schema.sql`
3. `003_model_catalog_expand.sql`
4. `004_image_models.sql`
5. `004_raw_mode_settings.sql`
6. `005_list_indexes.sql`
7. `006_relay_hardening.sql` ← **held_balance / idempotency / min_cost / rate_limit**

命令：`npm run db:migrate`。  
未跑 `006` 时，`lib/db/ensure-relay-hardening.ts` 的 `ensureRelayHardeningSchema()` 会在鉴权/账单/管理账号与模型列表等路径 **进程内补一次**（PR #5）。

---

## 3. 已完成（main 已合并）

| PR | 内容 |
|----|------|
| #1 | V1 骨架：开户/Token/任务/提示词/计费/用量闭环 |
| #2 | OpenAI 兼容 `POST /images/edits`（版式翻译等） |
| #3 | 图片路径别名，兼容客户端二次拼接 `/v1` 导致 404 |
| #4 | 中继加固：预扣、限流、幂等、缓存、stream、`GET /models`、SSRF、图模地板价、文档/SDK |
| #5 | 生产缺列时自动 `ADD COLUMN IF NOT EXISTS held_balance` 等，修管理端充值下拉空列表 |

### 业务能力摘要

- **Task / Raw 双模式** + 全局与站点开关
- **OpenAI 兼容**：`/chat/completions`（含 vision、纯文本 `stream`）、`/images/edits`、`/images/generations`、`/models`
- **预置任务**：`ping`、`apparel_image_enrich`、`blog_topic_recommend`、`blog_seo_article`（后台「同步预置能力」）
- **计费**：调用前 `held_balance` 预扣；失败释放；成功按实际 cost 结算；可用余额 = `balance - held_balance`
- **限流**：进程内按站点桶，默认约 120/min（`rate_limit_per_minute`）；429 + `Retry-After`
- **幂等**：请求头 `Idempotency-Key`，成功 JSON 可重放（流式不缓存）
- **账户 API**：`GET /account` 返回 `held_balance`、`available`
- **管理端**：设置页可改限流；账号页显示预扣/可用；模型页可编 `min_cost_per_call`

### 文档

- `docs/BUSINESS-SITE-INTEGRATION.md` — 业务站 codegen 规格（唯一对接源）
- `docs/CURSOR-HANDOFF.md` — 业务站粘贴用短提示
- `README.md` — 部署与迁移清单（已含 006）

---

## 4. 未完成 / 已知缺口

1. **Git 工作区可能落后 main**  
   部分 Cloud Agent 沙箱仍停在旧功能分支（如 `cursor/v1-ai-scheduler-e1cf`），与 `origin/main` 分叉。**新会话请先 `git fetch && git checkout main && git pull`。**

2. **生产迁移仍建议显式执行**  
   #5 是安全网，不能替代正式跑 `006_relay_hardening.sql`。合 #4 后曾出现管理端报错 `column a.held_balance does not exist`，充值下拉空白——根因就是漏跑迁移。

3. **限流是进程内 best-effort**  
   Serverless 多实例下不是全局精确限流；若要严格全局限流需 Redis / Upstash 等。

4. **幂等仅缓存成功 JSON**  
   流式 chat、失败响应不重放；无请求体哈希冲突检测。

5. **OpenAI 表面仍不完整**  
   无 embeddings、audio、responses API、tools/function calling 完整面等。

6. **SDK 与文档**  
   已有 chat/images/`listModels`/idempotency 辅助，但业务站侧未必都已升级客户端；`available` 字段需调用方主动使用。

7. **预扣残留**  
   进程崩溃且未走 `releaseHold` 时，可能短暂占住 `held_balance`；尚无定时回收/对账任务。

8. **观测与运维**  
   无独立告警、无 hold 对账报表、无按站点的限流命中看板。

9. **安全/合规后续**  
   SSRF 已挡私网图 URL；仍可加强（重定向跟随、DNS rebinding 二次校验、上传体积配额策略统一等）。

10. **双 `004_*.sql` 文件名**  
    `004_image_models.sql` 与 `004_raw_mode_settings.sql` 同号，依赖文件名排序；改名需谨慎，避免重复执行语义混乱。

---

## 5. 下一步建议（优先级）

### P0 — 运维确认

1. 在生产 Supabase SQL Editor 确认 `accounts.held_balance`、`idempotency_keys`、`model_catalog.min_cost_per_call`、`system_settings.rate_limit_per_minute` 已存在
2. 打开 https://www.ryfs.cn 管理端 → **账号/充值**：列表与下拉应能加载站点；若仍报缺列，先跑 006 或触发一次会走 `ensureRelayHardeningSchema` 的接口后刷新
3. 新 Agent / 本地开发：**一律从 `main` 开分支**，模板 `cursor/<描述>-e1cf`

### P1 — 产品加固

1. 增加 hold 超时释放（cron / 队列）：例如预扣超过 N 分钟且无对应成功流水则回滚
2. 将限流改为共享存储（Redis），避免多实例漏限
3. 管理端「用量/对账」页展示 held、幂等命中、429 次数
4. SDK 小版本：默认读取 `available`；chat stream 辅助方法

### P2 — 扩展

1. 按需补 OpenAI 兼容面（embeddings / tools）
2. 幂等扩展到更多写路径与失败短路策略
3. 统一图片大小/张数配额与错误码文档

### 业务站侧（非本仓必改）

- PackFlow 等：图编 Base URL 优先 `https://www.ryfs.cn/api/v1`；若客户端再拼 `/v1` 导致 HTML 404，改用 `https://www.ryfs.cn/api`（已有别名）
- 视觉模型示例：`google/gemini-2.5-flash`
- 图编模型示例：`google/gemini-3.1-flash-lite-image`（短名可解析）

---

## 6. 给下一任 Agent 的操作备忘

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b cursor/<topic>-e1cf

npm install
npm run build
# 有 DATABASE_URL 时：
npm run db:migrate
```

改 Next 相关代码前先读本仓库 `node_modules/next/dist/docs/`。  
PR 用仓库已有流程；Cloud Agent 用 `ManagePullRequest`，不要用 `gh pr create` 写操作。  
`docs/CURSOR-HANDOFF.md` 勿与本文件混淆；更新业务对接规格时改 `docs/BUSINESS-SITE-INTEGRATION.md`。

### 近期相关 PR

- https://github.com/coraycn-cpu/AIway/pull/4 — 中继加固  
- https://github.com/coraycn-cpu/AIway/pull/5 — held_balance 自动补齐  

---

## 7. 一句话状态

**V1 调度闭环 + OpenAI 兼容图片/对话 + 中继加固已在 `main`；生产务必确认迁移 006（或依赖 #5 自动补齐）。下一优先：hold 对账回收、全局限流、从 `main` 干净开分支继续迭代。**
