# AIway 业务网站接入文档

> 适用对象：业务站后端开发  
> 目标：约 30 分钟完成 Token 联调  
> 原则：业务站**不持有**上游模型 Key；只持有调度系统 Token

### 给另一个 Cursor 项目直接用

公网可拉取（部署后）：

- 本文档 Markdown：`/api/docs/business-integration`
- 客户端 SDK：`/sdk/aiway-client.ts`
- 说明页：`/integration`
- 交接提示词：见 `docs/CURSOR-HANDOFF.md`

---

## 1. 你需要什么

向调度管理员索取：

| 项 | 说明 |
|----|------|
| `AI_SCHEDULER_URL` | 例如 `https://xxx.vercel.app/api/v1` |
| `AI_SCHEDULER_TOKEN` | 形如 `sk_...`，仅创建时展示一次 |
| 可用 `task` 列表 | 如 `ping`、`apparel_image_enrich`、`blog_topic_recommend`、`blog_seo_article` |

业务站**不需要**：

- OpenAI / Gemini / DeepSeek 等厂商 Key  
- 提示词原文（Task 模式下提示词只在调度后台维护；Raw 模式可自带）  
- 管理后台账号密码

---

## 2. 环境变量（仅服务端）

```bash
AI_SCHEDULER_URL=https://<aiway-host>/api/v1
AI_SCHEDULER_TOKEN=sk_xxxxxxxx
```

**禁止**写入：

- 前端 `NEXT_PUBLIC_*`
- 浏览器 JS / 小程序前端包
- 公开仓库

推荐放在：Next.js Server Action / Route Handler、Node API、Worker、服务端脚本。

---

## 3. 鉴权与约定

- Base URL：`AI_SCHEDULER_URL`（已含 `/api/v1`）
- Header：

```http
Authorization: Bearer <AI_SCHEDULER_TOKEN>
Content-Type: application/json
```

- 编码：UTF-8 JSON  
- 超时建议：文本任务 60s；带图任务 90–120s  
- 幂等：可传 `trace_id` 便于你们日志关联（调度侧也会生成 `request_id`）

---

## 4. API 一览

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/run` | 调用 AI 能力并扣费 |
| `GET` | `/account` | 查本站余额/额度 |
| `GET` | `/usage` | 查本站用量列表 |
| `GET` | `/usage/{request_id}` | 查单次调用 |

所有接口只能读/写**本 Token 对应站点**数据。

---

## 5. `POST /run` — 调 AI

支持 **Task** 与 **Raw** 双模式（由 AIway 后台全局开关 + 站点 `raw_enabled` 控制）。

| 模式 | 何时用 | 业务站传什么 | 开关 |
|------|--------|--------------|------|
| Task（默认） | 提示词由 AIway 统一管理 | `{ task, input }` | 全局 `task_mode_enabled` |
| Raw | 业务站自带模型与提示词，仍走鉴权扣费 | `{ mode:"raw", model_id, system?, prompt, ... }` | 全局 `raw_mode_enabled` **且** 站点 `raw_enabled` |

`GET /account` 会返回 `modes.can_use_task` / `modes.can_use_raw`，便于业务站探测。

### 5.1 Task 模式（默认）

```json
{
  "task": "apparel_image_enrich",
  "input": {
    "image_url": "https://cdn.example.com/a.jpg"
  },
  "trace_id": "optional-biz-id"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | string | 是 | 任务能力码，由调度后台配置 |
| `input` | object | 是 | 业务字段；键名需符合该任务字段契约 |
| `trace_id` | string | 否 | 业务侧追踪 ID |
| `mode` | `"task"` | 否 | 可省略；默认即 task |

### 5.2 Raw 模式

需管理员先打开：后台「运行模式」→ 全局 Raw，再在「站点」对该站点「开 Raw」。

```json
{
  "mode": "raw",
  "model_id": "google/gemini-2.5-flash",
  "system": "You are a helpful assistant. Reply in JSON.",
  "prompt": "Summarize this product...",
  "temperature": 0.7,
  "max_tokens": 2048,
  "image_urls": ["https://cdn.example.com/a.jpg"],
  "trace_id": "optional-biz-id"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | `"raw"` | 是 | 固定为 raw |
| `model_id` | string | 是 | 须在 AIway 模型目录中且已启用 |
| `prompt` | string | 是 | 用户提示词 |
| `system` | string | 否 | 系统提示词 |
| `temperature` | number | 否 | 0–2 |
| `max_tokens` | number | 否 | 上限 16000 |
| `image_urls` | string[] | 否 | 公网图片 URL（最多 6） |
| `trace_id` | string | 否 | 业务追踪 ID |

SDK：`runRaw` / `runRawJson`。用量日志 `task_code` 记为 `raw`。

未开开关时返回 `403`：`Raw mode is disabled...`。

### 成功响应（示例）

```json
{
  "request_id": "uuid",
  "mode": "task",
  "output_text": "{ ... JSON 或纯文本 ... }",
  "output_json": {},
  "output_format": "json",
  "prompt_scope": "global",
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567,
    "total_tokens": 1801,
    "cost": 0.012345,
    "model_id": "google/gemini-2.5-flash"
  },
  "balance": 9.987655
}
```

| 字段 | 说明 |
|------|------|
| `mode` | `task` 或 `raw` |
| `output_text` | 模型输出正文。若可识别为 JSON，网关会去掉 \`\`\`json 围栏并归一化为纯 JSON 字符串 |
| `output_json` | 已解析对象（推荐优先使用）；解析失败则为 `null` |
| `output_format` | `json` 或 `text` |
| `prompt_scope` | Task：`global` / `site`；Raw：固定 `raw` |
| `usage.cost` | 本次扣费 |
| `balance` | 扣费后余额 |

业务站推荐读取顺序：`output_json` → 再兜底解析 `output_text`（SDK `runTaskJson` / `runRawJson` 已兼容 markdown 代码块）。

### 图片字段约定

若任务需要识图，在 `input` 中传公网可访问 URL：

- `image_url`：主图（推荐）
- `image_urls` / `images`：附加图（数组或逗号分隔，最多约 6 张）
- 也兼容 `fabric_image_url`、`product_image_url`

要求：

1. 必须是 `https://`（或可被 Gateway 拉取的 `http://`）  
2. 不要传 base64 到本接口（请先上传到你们 CDN/OSS，再传 URL）  
3. 私有桶请先签发短期可读 URL  

---

## 6. 预置能力说明（当前推荐）

> 具体字段以调度后台「任务详情」为准；以下为官方预置。

### 6.1 `ping` — 联调探活

```json
{
  "task": "ping",
  "input": { "message": "hello" }
}
```

用于验证 Token、余额、网络。

---

### 6.2 `apparel_image_enrich` — 服装/面料图 → 英文商品字段

**用途**：用户上传服装或面料图后，自动补全英文上架字段与简述。

**主要入参**

| 字段 | 必填 | 示例 |
|------|------|------|
| `image_url` | 是 | `https://cdn.../dress.jpg` |
| `image_urls` | 否 | 附加图 |
| `category_hint` | 否 | `women knitted dress` |
| `brand_voice` | 否 | `modern wholesale apparel` |
| `known_specs` | 否 | 已知规格 JSON/文本 |

**请求示例**

```ts
const res = await fetch(`${process.env.AI_SCHEDULER_URL}/run`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.AI_SCHEDULER_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    task: "apparel_image_enrich",
    input: {
      image_url: productImagePublicUrl,
      category_hint: "women knitted dress",
      brand_voice: "modern wholesale apparel",
    },
    trace_id: `product-${productId}`,
  }),
});

const data = await res.json();
if (!res.ok) throw new Error(data?.error?.message || "run failed");

const fields = JSON.parse(data.output_text);
// fields.title / short_description / long_description / color_name / ...
```

**`output_text` 解析后常见字段**

`title`, `short_description`, `long_description`, `product_type`, `gender`, `season`, `style_tags`, `color_name`, `material_guess`, `care_instructions`, `seo_title`, `seo_description`, `alt_text`, `confidence`, `notes` …

---

### 6.3 `blog_topic_recommend` — SEO/GEO 英文选题

**用途**：按网站主题与目标人群，推荐易收录/可被生成式引擎引用的英文选题。

**主要入参**

| 字段 | 必填 | 示例 |
|------|------|------|
| `site_theme` | 是 | `sustainable women's knitwear wholesale` |
| `target_audience` | 是 | `US boutique buyers` |
| `primary_market` | 否 | `United States` |
| `existing_topics` | 否 | 已有文章，避免重复 |
| `count` | 否 | `8` |
| `geo_focus` | 否 | GEO 侧重点说明 |

**请求示例**

```ts
const res = await fetch(`${base}/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    task: "blog_topic_recommend",
    input: {
      site_theme: "sustainable women's knitwear wholesale",
      target_audience: "US boutique buyers and small fashion brands",
      primary_market: "United States",
      count: "8",
    },
  }),
});
const data = await res.json();
const topics = JSON.parse(data.output_text);
// topics.topics[]: title, primary_keyword, faq_seeds, suggested_internal_links...
```

---

### 6.4 `blog_seo_article` — 英文成稿 + 站内关联

**用途**：按选定选题生成完整英文文章（Markdown）、meta、FAQ、内链。

**主要入参**

| 字段 | 必填 | 示例 |
|------|------|------|
| `site_theme` | 是 | 网站主题 |
| `target_audience` | 是 | 目标人群 |
| `topic_title` | 是 | 选题标题 |
| `primary_keyword` | 是 | 主关键词 |
| `secondary_keywords` | 否 | 次关键词 |
| `internal_link_map` | 否 | 多行：`标题|/path` |
| `brand_name` | 否 | 品牌名 |
| `word_count` | 否 | `1200` |
| `cta` | 否 | 文末行动号召 |

**推荐业务流程**

```text
blog_topic_recommend → 人工/规则选定选题 → blog_seo_article → 写入 CMS
```

**请求示例**

```ts
const res = await fetch(`${base}/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    task: "blog_seo_article",
    input: {
      site_theme: "sustainable women's knitwear wholesale",
      target_audience: "US boutique buyers",
      topic_title: "How boutique buyers evaluate knitwear quality",
      primary_keyword: "wholesale knitwear quality checklist",
      internal_link_map:
        "Fabric Care Guide|/blog/fabric-care\nMOQ Explained|/guides/moq",
      brand_name: "LeapClothes",
      word_count: "1200",
      cta: "Request fabric swatches",
    },
  }),
});
const article = JSON.parse((await res.json()).output_text);
// article.article_markdown / meta_title / faq / internal_links_used ...
```

---

## 7. `GET /account` — 查余额

```http
GET /api/v1/account
Authorization: Bearer sk_xxx
```

响应示例：

```json
{
  "site_code": "apparel",
  "site_name": "服装商城",
  "status": "active",
  "balance": 12.5,
  "month_quota": null,
  "month_used": 1.2,
  "month_remaining": null,
  "modes": {
    "task_mode_enabled": true,
    "raw_mode_enabled": true,
    "site_raw_enabled": true,
    "can_use_task": true,
    "can_use_raw": true
  }
}
```

建议：在调用高成本任务前先检查 `balance`；`status` 非 `active` 时不要继续调用。用 Raw 前先确认 `modes.can_use_raw === true`。

---

## 8. `GET /usage` — 查用量

```http
GET /api/v1/usage?from=&to=&page=1&page_size=20&task=apparel_image_enrich
Authorization: Bearer sk_xxx
```

| 参数 | 说明 |
|------|------|
| `from` / `to` | ISO 时间，可选 |
| `page` / `page_size` | 分页，`page_size` 最大 100 |
| `task` | 按 task_code 过滤 |

响应含 `items[]` 与 `summary`（总次数、总费用、总 tokens）。

单次查询：

```http
GET /api/v1/usage/{request_id}
```

---

## 9. 错误码

统一错误体：

```json
{
  "error": {
    "code": "402",
    "message": "Insufficient balance"
  }
}
```

| HTTP | 含义 | 业务站建议 |
|------|------|------------|
| 400 | 参数错误 / 缺必填字段 | 检查 `task` 与 `input` |
| 401 | Token 无效或缺失 | 检查环境变量与 Header |
| 402 | 余额或月额度不足 | 提示管理员充值 |
| 403 | 站点/账号停用 | 停止调用并告警 |
| 404 | 任务/提示词/记录不存在 | 确认 task 已开通且有全局提示词 |
| 429 | 限流 | 退避重试 |
| 502 | 上游模型失败 | 可重试；保留 `request_id` 反馈 |

---

## 10. 推荐封装（TypeScript）

```ts
// lib/aiway.ts
type RunInput = {
  task: string;
  input?: Record<string, unknown>;
  trace_id?: string;
};

export class AiwayError extends Error {
  status: number;
  code: string;
  body: unknown;
  constructor(status: number, body: any) {
    super(body?.error?.message || `Aiway HTTP ${status}`);
    this.status = status;
    this.code = String(body?.error?.code || status);
    this.body = body;
  }
}

function env() {
  const base = process.env.AI_SCHEDULER_URL;
  const token = process.env.AI_SCHEDULER_TOKEN;
  if (!base || !token) throw new Error("AI_SCHEDULER_URL / AI_SCHEDULER_TOKEN missing");
  return { base: base.replace(/\/$/, ""), token };
}

async function aiwayFetch(path: string, init: RequestInit = {}) {
  const { base, token } = env();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiwayError(res.status, data);
  return data;
}

export async function runTask(payload: RunInput) {
  return aiwayFetch("/run", {
    method: "POST",
    body: JSON.stringify({
      mode: "task",
      task: payload.task,
      input: payload.input ?? {},
      trace_id: payload.trace_id,
    }),
  });
}

/** Raw：业务站自带提示词（需管理员开全局 Raw + 站点 raw_enabled） */
export async function runRaw(payload: {
  model_id: string;
  system?: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  image_urls?: string[];
  trace_id?: string;
}) {
  return aiwayFetch("/run", {
    method: "POST",
    body: JSON.stringify({ mode: "raw", ...payload }),
  });
}

/** 预置能力返回多为 JSON；完整实现见 /sdk/aiway-client.ts（含围栏剥离） */
export async function runTaskJson<T = unknown>(payload: RunInput): Promise<{
  data: T;
  request_id: string;
  usage: any;
  balance: number;
  prompt_scope?: string;
}> {
  const raw = await runTask(payload);
  let parsed: T;
  try {
    parsed = JSON.parse(raw.output_text) as T;
  } catch {
    throw new Error(`output_text is not JSON: ${String(raw.output_text).slice(0, 200)}`);
  }
  return {
    data: parsed,
    request_id: raw.request_id,
    usage: raw.usage,
    balance: raw.balance,
    prompt_scope: raw.prompt_scope,
  };
}

export async function getAccount() {
  return aiwayFetch("/account");
}

export async function listUsage(query = "page=1&page_size=20") {
  return aiwayFetch(`/usage?${query}`);
}
```

### Next.js Route Handler 示例

```ts
// app/api/product/enrich/route.ts
import { runTaskJson } from "@/lib/aiway";

export async function POST(req: Request) {
  const { imageUrl, productId } = await req.json();
  const result = await runTaskJson({
    task: "apparel_image_enrich",
    input: { image_url: imageUrl },
    trace_id: `product-${productId}`,
  });
  // TODO: 将 result.data 写入商品表
  return Response.json(result);
}
```

---

## 11. 联调检查清单

1. [ ] 服务端已配置 `AI_SCHEDULER_URL`、`AI_SCHEDULER_TOKEN`  
2. [ ] `GET /account` 返回本站 `balance` 且 `status=active`  
3. [ ] `POST /run` + `task=ping` 成功  
4. [ ] 真实能力（图析或博客）跑通，并能用 `output_json` / `runTaskJson`  
5. [ ] （可选）管理员开 Raw 后，`modes.can_use_raw` 为 true，`runRaw` 成功  
6. [ ] `GET /usage` 能看到刚才的 `request_id`  
7. [ ] 前端网络面板中**看不到** Token  
8. [ ] 余额为 0 时收到 `402` 并有产品侧提示  

---

## 12. 常见问题

**Q: 提示词要写在业务站吗？**  
A: 不要。只传 `task` + `input`。改文案由调度后台完成，业务站不用发版。

**Q: 服装站和五金站 task 要拆开吗？**  
A: 通常共用同一 `task`；差异用调度后台「站点提示词覆盖」。业务站调用方式不变。

**Q: `output_text` 有时不是 JSON？**  
A: 预置能力按 JSON 设计，但仍建议 `try/catch` 解析；失败时把 `request_id` 发给管理员。

**Q: 扣费失败会怎样？**  
A: 余额不足会在调用前拒绝（402）。上游失败记 `502` 日志，通常不扣成功费用。

**Q: 如何换模型？**  
A: 业务站不用改。管理员在任务详情改默认模型即可。

---

## 13. 联系管理员时请提供

- `request_id`  
- `trace_id`（若有）  
- `task`  
- 发生时间（UTC/本地）  
- HTTP 状态码与 `error.message`  
- 是否含图片 URL（可打码域名后路径）  

---

文档版本：V1  
维护方：AIway 调度系统
