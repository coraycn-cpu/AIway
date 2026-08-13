# AIway 业务网站接入文档

> **适用对象**：业务站后端 / 另一个 Cursor 项目  
> **目标**：约 30 分钟完成 Token 联调  
> **原则**：业务站**不持有**上游模型 Key；只持有 AIway 调度 Token  
> **文档版本**：V1.3（生产域名 `www.ryfs.cn`）  
> **生产根地址**：`https://www.ryfs.cn`

---

## 0. 生产环境入口

| 用途 | 完整 URL |
|------|----------|
| Open API 根路径 | `https://www.ryfs.cn/api/v1` |
| Open API | `POST https://www.ryfs.cn/api/v1/run` |
| OpenAI 兼容 | `POST https://www.ryfs.cn/api/v1/chat/completions` |
| 查余额 / 模式 | `GET https://www.ryfs.cn/api/v1/account` |
| 查用量 | `GET https://www.ryfs.cn/api/v1/usage` |
| 单次用量 | `GET https://www.ryfs.cn/api/v1/usage/{request_id}` |
| 本文档（Markdown） | `https://www.ryfs.cn/api/docs/business-integration` |
| 官方 SDK | `https://www.ryfs.cn/sdk/aiway-client.ts` |
| 可视化说明页 | `https://www.ryfs.cn/integration` |
| 管理后台登录 | `https://www.ryfs.cn/login` |

**推荐做法**：把 SDK 下载到业务站服务端（如 `lib/aiway-client.ts`），不要手抄半截封装。

```bash
curl -fsSL "https://www.ryfs.cn/sdk/aiway-client.ts" -o lib/aiway-client.ts
```

---

## 1. 你需要什么

向 AIway 管理员索取：

| 项 | 说明 |
|----|------|
| `AI_SCHEDULER_URL` | `https://www.ryfs.cn/api/v1`（**已含** `/api/v1`） |
| `AI_SCHEDULER_TOKEN` | 形如 `sk_...`，创建时只展示一次 |
| 可用能力 | 至少：`ping`；业务：`apparel_image_enrich` / `blog_topic_recommend` / `blog_seo_article` |
| （可选）Raw 权限 | 若要用自带提示词：管理员需开「全局 Raw」+ 本站「开 Raw」 |

业务站**不需要**：

- OpenAI / Gemini / DeepSeek 等厂商 Key  
- Task 模式下的提示词原文（由 AIway 后台维护）  
- 管理后台账号密码  

---

## 2. 五分钟快速上手

```bash
# 1) 环境变量（仅服务端）
AI_SCHEDULER_URL=https://www.ryfs.cn/api/v1
AI_SCHEDULER_TOKEN=sk_xxxxxxxx

# 2) 下载 SDK
curl -fsSL "https://www.ryfs.cn/sdk/aiway-client.ts" -o lib/aiway-client.ts
```

```ts
// 3) 探活
import { getAccount, runTaskJson } from "@/lib/aiway-client";

const account = await getAccount();
console.log(account.balance, account.modes);

const ping = await runTaskJson({ task: "ping", input: { message: "hi" } });
console.log(ping.data, ping.request_id);
```

联调顺序建议：`getAccount` → `ping` → 真实业务 task →（可选）`runRaw`。

---

## 3. 环境变量（仅服务端）

```bash
AI_SCHEDULER_URL=https://www.ryfs.cn/api/v1
AI_SCHEDULER_TOKEN=sk_xxxxxxxx
```

**禁止**写入：

- 前端 `NEXT_PUBLIC_*`
- 浏览器 JS / 小程序前端包
- 公开仓库

推荐放在：Next.js Server Action / Route Handler、Node API、Worker、服务端脚本。

---

## 4. 鉴权与约定

- Base URL：`https://www.ryfs.cn/api/v1`（环境变量 `AI_SCHEDULER_URL`）
- Header：

```http
Authorization: Bearer <AI_SCHEDULER_TOKEN>
Content-Type: application/json
```

| 约定 | 建议 |
|------|------|
| 编码 | UTF-8 JSON |
| 超时 | 文本 60s；带图 90–120s |
| 追踪 | 可传 `trace_id`（业务侧）；响应含 `request_id`（调度侧） |
| 作用域 | Token 只能访问**本站点**数据 |

---

## 5. API 一览

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/run` | 调用 AI 并扣费（Task 或 Raw） |
| `POST` | `/chat/completions` | **OpenAI 兼容**（业务站「OpenAI 兼容视觉接口」用这个） |
| `GET` | `/account` | 查余额 / 额度 / 模式开关 |
| `GET` | `/usage` | 查本站用量列表（分页） |
| `GET` | `/usage/{request_id}` | 查单次调用 |

---

## 6. `POST /run` — 双模式

AIway 支持 **Task** 与 **Raw** 两种调用方式，由后台开关控制。

| 模式 | 何时用 | 请求体 | 开关条件 |
|------|--------|--------|----------|
| **Task**（默认） | 提示词由 AIway 统一管理，业务站只传业务字段 | `{ task, input }` | 全局 `task_mode_enabled` |
| **Raw** | 业务站自带 `model_id` + 提示词，仍走鉴权扣费 | `{ mode:"raw", model_id, prompt, ... }` | 全局 `raw_mode_enabled` **且** 站点 `raw_enabled` |

探测权限：先调 `GET /account`，看 `modes.can_use_task` / `modes.can_use_raw`。

### 6.0 业务站「OpenAI 兼容视觉接口」怎么填

若后台选的是 **OpenAI 兼容视觉接口**（会自动请求 `{Base URL}/chat/completions`）：

| 字段 | 填写 |
|------|------|
| 服务商 | OpenAI 兼容视觉接口 |
| 视觉模型 | `google/gemini-2.5-flash`（目录完整 id；也可写 `gemini-2.5-flash`。`gemini-2.0-flash` 在 Gateway 上可能已不可用） |
| 视觉 API Key | AIway 签发的 `sk_...` |
| 视觉 Base URL | **`https://www.ryfs.cn/api/v1`**（不要写成 `/api/v1/run`） |

实际请求：`POST https://www.ryfs.cn/api/v1/chat/completions`  
计费走 Raw（需全局 Raw + 站点 Raw）。图片优先传 **公网 https URL**；也接受较小的 `data:image/...;base64,`（约 3.5MB 以内）。

若误把 Base URL 填成 `https://www.ryfs.cn/api/v1/run`，AIway 也兼容 `.../run/chat/completions`，但推荐仍用 `/api/v1`。

502 时响应 `error.message` 会带上 Gateway 原文（例如模型未开通、图片拉取失败），同时写入调用日志 `error_message`。

### 6.1 Task 模式（默认，推荐）

```json
{
  "mode": "task",
  "task": "apparel_image_enrich",
  "input": {
    "image_url": "https://cdn.example.com/a.jpg"
  },
  "trace_id": "optional-biz-id"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | string | 是 | 任务能力码（后台配置） |
| `input` | object | 是 | 业务字段；键名须符合该任务契约 |
| `trace_id` | string | 否 | 业务追踪 ID |
| `mode` | `"task"` | 否 | 可省略；默认即 task |

SDK：`runTask` / `runTaskJson`，以及预置封装 `enrichApparelFromImage` 等。

### 6.2 Raw 模式

管理员操作：

1. 后台侧栏 **运行模式** → 打开「Raw 模式（全局）」  
2. **站点** 列表 → 对本站点「开 Raw」  
3. 业务站确认 `modes.can_use_raw === true`

```json
{
  "mode": "raw",
  "model_id": "google/gemini-2.5-flash",
  "system": "You are a helpful assistant. Reply in JSON only.",
  "prompt": "Summarize this product for wholesale buyers...",
  "temperature": 0.7,
  "max_tokens": 2048,
  "image_urls": ["https://cdn.example.com/a.jpg"],
  "trace_id": "optional-biz-id"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | `"raw"` | 是 | 固定为 `raw` |
| `model_id` | string | 是 | 须在 AIway「模型目录」中且已启用 |
| `prompt` | string | 是 | 用户提示词 |
| `system` | string | 否 | 系统提示词 |
| `temperature` | number | 否 | 0–2，默认约 0.7 |
| `max_tokens` | number | 否 | 上限 16000 |
| `image_urls` | string[] | 否 | 公网 https URL，或较小的 `data:image` URI，最多 6 |
| `input` | object | 否 | 额外透传（如兼容 `image_url`） |
| `trace_id` | string | 否 | 业务追踪 ID |

SDK：`runRaw` / `runRawJson`。用量日志中 `task_code` 记为 `raw`。

未开开关时返回 **403**（如 `Raw mode is disabled...`）。

### 6.3 成功响应

```json
{
  "request_id": "uuid",
  "mode": "task",
  "output_text": "{ ... }",
  "output_json": { "title": "..." },
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
| `output_json` | **优先使用**：已解析对象；失败为 `null` |
| `output_text` | 正文；若可识别为 JSON，网关会去掉 \`\`\`json 围栏并归一化 |
| `output_format` | `json` 或 `text` |
| `prompt_scope` | Task：`global` / `site`；Raw：固定 `raw` |
| `usage.cost` | 本次扣费（USD） |
| `balance` | 扣费后余额 |

**解析推荐顺序**：`output_json` → `runTaskJson` / `runRawJson` → 自行 `extractJsonText(output_text)`。  
**不要**只写 `JSON.parse(output_text)`（模型常包 markdown 代码块）。

### 6.4 图片字段约定

Task 模式在 `input` 中传公网可访问 URL：

- `image_url`：主图（推荐）
- `image_urls` / `images`：附加图（数组或逗号分隔，最多约 6）
- 兼容别名：`fabric_image_url`、`product_image_url`

Raw 模式用顶层 `image_urls`（也可放 `input.image_url`）。

要求：

1. 优先 `https://`（Gateway 可拉取的公网 URL）  
2. 也接受较小的 `data:image/...;base64,`（约 3.5MB 以内）；大图请先上传 CDN/OSS  
3. 私有桶请签发短期可读 URL  
4. 识图任务请选视觉模型（推荐 `google/gemini-2.5-flash`）

---

## 7. 预置能力

> 字段以调度后台「任务详情」为准；以下为官方预置。管理员可在任务页「同步预置能力」。

### 7.1 `ping` — 联调探活

```ts
import { runTaskJson } from "@/lib/aiway-client";

const { data, request_id } = await runTaskJson({
  task: "ping",
  input: { message: "hello" },
});
```

用于验证 Token、余额、网络。

### 7.2 `apparel_image_enrich` — 服装/面料图 → 英文商品字段

| 字段 | 必填 | 示例 |
|------|------|------|
| `image_url` | 是 | `https://cdn.../dress.jpg` |
| `image_urls` | 否 | 附加图 |
| `category_hint` | 否 | `women knitted dress` |
| `brand_voice` | 否 | `modern wholesale apparel` |
| `known_specs` | 否 | 已知规格 |

```ts
import { enrichApparelFromImage } from "@/lib/aiway-client";

const { data, request_id, usage, balance } = await enrichApparelFromImage({
  image_url: productImagePublicUrl,
  category_hint: "women knitted dress",
  brand_voice: "modern wholesale apparel",
  trace_id: `product-${productId}`,
});
// data.title / short_description / long_description / color_name / ...
```

常见输出字段：`title`, `short_description`, `long_description`, `product_type`, `gender`, `season`, `style_tags`, `color_name`, `material_guess`, `care_instructions`, `seo_title`, `seo_description`, `alt_text`, `confidence`, `notes` …

### 7.3 `blog_topic_recommend` — SEO/GEO 英文选题

| 字段 | 必填 | 示例 |
|------|------|------|
| `site_theme` | 是 | `sustainable women's knitwear wholesale` |
| `target_audience` | 是 | `US boutique buyers` |
| `primary_market` | 否 | `United States` |
| `existing_topics` | 否 | 已有文章，避免重复 |
| `count` | 否 | `8`（字符串或数字均可，SDK 会规范化） |
| `geo_focus` | 否 | GEO 侧重点 |

```ts
import { recommendBlogTopics } from "@/lib/aiway-client";

const { data } = await recommendBlogTopics({
  site_theme: "sustainable women's knitwear wholesale",
  target_audience: "US boutique buyers and small fashion brands",
  primary_market: "United States",
  count: 8,
});
// data.topics[]: title, primary_keyword, intent_seeds, suggested_internal_links...
```

### 7.4 `blog_seo_article` — 英文成稿 + 站内关联

| 字段 | 必填 | 说明 |
|------|------|------|
| `site_theme` | 是 | 网站主题 |
| `target_audience` | 是 | 目标人群 |
| `topic_title` | 是 | 选题标题 |
| `primary_keyword` | 是 | 主关键词 |
| `secondary_keywords` | 否 | 次关键词 |
| `internal_link_map` | 否 | 多行：`标题|/path` |
| `brand_name` | 否 | 品牌名 |
| `word_count` | 否 | 如 `1200` |
| `cta` | 否 | 文末行动号召 |

推荐流程：

```text
blog_topic_recommend → 选定选题 → blog_seo_article → 写入 CMS
```

```ts
import { writeBlogSeoArticle } from "@/lib/aiway-client";

const { data } = await writeBlogSeoArticle({
  site_theme: "sustainable women's knitwear wholesale",
  target_audience: "US boutique buyers",
  topic_title: "How boutique buyers evaluate knitwear quality",
  primary_keyword: "wholesale knitwear quality checklist",
  internal_link_map:
    "Fabric Care Guide|/blog/fabric-care\nMOQ Explained|/guides/moq",
  brand_name: "LeapClothes",
  word_count: 1200,
  cta: "Request fabric swatches",
});
// data.article_markdown / meta_title / faq / internal_links_used ...
```

---

## 8. `GET /account` — 余额与模式

```http
GET https://www.ryfs.cn/api/v1/account
Authorization: Bearer sk_xxx
```

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

| 字段 | 说明 |
|------|------|
| `status` | 非 `active` 时不要继续调用 |
| `balance` | 当前余额；高成本任务前建议检查 |
| `month_quota` / `month_used` / `month_remaining` | 月额度（可为 null 表示不限） |
| `modes.can_use_task` | 当前是否允许 Task |
| `modes.can_use_raw` | 当前是否允许 Raw（全局 ∧ 站点） |

```ts
import { getAccount } from "@/lib/aiway-client";

const acc = await getAccount();
if (acc.status !== "active" || acc.balance <= 0) {
  // 提示充值 / 停用
}
if (!acc.modes?.can_use_raw) {
  // 走 Task，或联系管理员开 Raw
}
```

---

## 9. `GET /usage` — 用量

```http
GET https://www.ryfs.cn/api/v1/usage?from=&to=&page=1&page_size=20&task=apparel_image_enrich
Authorization: Bearer sk_xxx
```

| 参数 | 说明 |
|------|------|
| `from` / `to` | ISO 时间，可选 |
| `page` / `page_size` | 分页；`page_size` 最大 100，默认 20 |
| `task` | 按 `task_code` 过滤（Raw 记为 `raw`） |

响应含 `items[]` 与 `summary`（总次数、总费用、总 tokens）。

```http
GET https://www.ryfs.cn/api/v1/usage/{request_id}
```

```ts
import { listUsage, getUsage } from "@/lib/aiway-client";

const page = await listUsage("page=1&page_size=20");
const one = await getUsage(requestId);
```

---

## 10. 错误码

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
| 400 | 参数错误 / 缺必填 / body 不合法 | 检查 Task `task`+`input` 或 Raw 字段 |
| 401 | Token 无效或缺失 | 检查环境变量与 Header |
| 402 | 余额或月额度不足 | 提示管理员充值；调用前可先查 `/account` |
| 403 | 站点停用，或 Task/Raw 模式未开启 | 停用则告警；模式问题联系管理员开开关 |
| 404 | 任务 / 模型 / 提示词 / 记录不存在 | 确认预置已同步、模型已启用、有全局提示词 |
| 429 | 限流 | 退避重试 |
| 502 | 上游模型失败 | 可重试；`error.message` 含 Gateway 原文；保留 `request_id` 反馈管理员 |

SDK 失败时抛出 `AiwayError`（含 `status` / `code` / `body`）。

---

## 11. 官方 SDK 用法

文件：`/sdk/aiway-client.ts`（复制到业务站服务端）。

| 函数 | 用途 |
|------|------|
| `runTask` / `runTaskJson` | Task 模式 |
| `runRaw` / `runRawJson` | Raw 模式 |
| `getAccount` | 余额 + modes |
| `listUsage` / `getUsage` | 用量 |
| `enrichApparelFromImage` | 服装图析封装 |
| `recommendBlogTopics` | 博客选题封装 |
| `writeBlogSeoArticle` | 博客成稿封装 |
| `extractJsonText` | 剥离 \`\`\`json 围栏 |

### Next.js Route Handler 示例

```ts
// app/api/product/enrich/route.ts
import { enrichApparelFromImage, AiwayError } from "@/lib/aiway-client";

export async function POST(req: Request) {
  try {
    const { imageUrl, productId } = await req.json();
    const result = await enrichApparelFromImage({
      image_url: imageUrl,
      trace_id: `product-${productId}`,
    });
    // TODO: 将 result.data 写入商品表
    return Response.json(result);
  } catch (e) {
    if (e instanceof AiwayError) {
      return Response.json(e.body, { status: e.status });
    }
    throw e;
  }
}
```

### Raw 示例

```ts
import { getAccount, runRawJson } from "@/lib/aiway-client";

const acc = await getAccount();
if (!acc.modes?.can_use_raw) {
  throw new Error("Raw mode not enabled for this site");
}

const { data, usage } = await runRawJson({
  model_id: "google/gemini-2.5-flash",
  system: "Reply with a JSON object only.",
  prompt: "Generate 3 product bullet points for a knit dress.",
  temperature: 0.5,
});
```

---

## 12. 联调检查清单

1. [ ] 服务端已配置 `AI_SCHEDULER_URL`、`AI_SCHEDULER_TOKEN`  
2. [ ] 已下载官方 SDK（含 `output_json` / 围栏剥离）  
3. [ ] `GET /account` 返回本站 `balance` 且 `status=active`  
4. [ ] `runTaskJson({ task: "ping", ... })` 成功  
5. [ ] 真实能力（图析或博客）跑通，优先读 `output_json` / `runTaskJson`  
6. [ ] （可选）管理员开 Raw 后 `modes.can_use_raw === true`，`runRawJson` 成功  
7. [ ] `GET /usage` 能看到对应 `request_id`（Raw 的 task 为 `raw`）  
8. [ ] 前端网络面板中**看不到** Token  
9. [ ] 余额为 0 时收到 `402` 并有产品侧提示  

---

## 13. 常见问题

**Q: 提示词要写在业务站吗？**  
A: Task 模式不要。只传 `task` + `input`。改文案由调度后台完成，业务站不用发版。若必须自带提示词，用 Raw（需管理员开开关）。

**Q: 服装站和五金站 task 要拆开吗？**  
A: 通常共用同一 `task`；差异用后台「站点提示词覆盖」。业务站调用方式不变。

**Q: 为什么 `JSON.parse(output_text)` 失败？**  
A: 模型常返回 \`\`\`json 围栏。请用 `output_json` 或 SDK 的 `runTaskJson` / `extractJsonText`。

**Q: 报 Task not found？**  
A: 预置能力未同步。请管理员到后台「任务」页点「同步预置能力」，并确认该任务有全局激活提示词。

**Q: Raw 返回 403？**  
A: 需要同时满足：全局 Raw 开、本站 Raw 开、Token 对应站点正确。先看 `/account.modes`。

**Q: 扣费失败会怎样？**  
A: 余额不足会在调用前拒绝（402）。上游失败记 502 日志，通常不按成功扣费。

**Q: 如何换模型？**  
A: Task：管理员改任务默认模型，业务站不用改。Raw：业务站在请求里传 `model_id`（须在目录中启用）。

**Q: Token 丢了怎么办？**  
A: 明文只展示一次。请管理员吊销旧 Token 并重新签发。

---

## 14. 联系管理员时请提供

- `request_id`  
- `trace_id`（若有）  
- `task` 或 `mode=raw` + `model_id`  
- 发生时间（UTC/本地）  
- HTTP 状态码与 `error.message`  
- 是否含图片 URL（可打码路径）  

---

文档版本：V1.3  
维护方：AIway 调度系统  
生产域名：`https://www.ryfs.cn`  
变更摘要：接口说明改为生产域名；补全 Task/Raw、modes 探测、`output_json` 优先解析与官方 SDK。
