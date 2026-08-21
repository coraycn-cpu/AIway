# AIway Open API（codegen）

`BASE=https://www.ryfs.cn/api/v1`  
`Authorization: Bearer <sk_...>`  
`Content-Type: application/json`

```text
AI_SCHEDULER_URL=https://www.ryfs.cn/api/v1
AI_SCHEDULER_TOKEN=sk_xxx
```

Token 仅服务端。SDK：`https://www.ryfs.cn/sdk/aiway-client.ts` → `lib/aiway-client.ts`

| 方法 | 路径 | SDK |
|------|------|-----|
| POST | `/run` | `runTask` `runTaskJson` `runRaw` `runRawJson` |
| POST | `/chat/completions` | `chatCompletions`（OpenAI 兼容；支持 `stream`） |
| POST | `/images/edits` | `imagesEdits` |
| POST | `/images/generations` | `imagesGenerations` |
| GET | `/models` | `listModels` |
| GET | `/account` | `getAccount` |
| GET | `/usage` | `listUsage` |
| GET | `/usage/{request_id}` | `getUsage` |

先 `GET /account`：`status==="active"` 且 `available>0`（无 `available` 字段时用 `balance>0`）。  
JSON 输出：用 `output_json` 或 `runTaskJson`/`runRawJson`，禁止只 `JSON.parse(output_text)`。  
图片：公网 `https://` 或 `data:image/...;base64,`（≤3.5MB），最多 6。别名：`image_url` `image_urls` `images` `fabric_image_url` `product_image_url`。内网/localhost URL 会被拒绝（SSRF 防护）。  
可选头：`Idempotency-Key`（同 key 成功响应可重放；流式请求不缓存）。  
超时：文本 60s，带图/生图 90–120s。默认站点限流约 120 次/分钟（429 + `Retry-After`）。

---

## POST /run — Task

需 `modes.can_use_task`。提示词在 AIway，业务站只传字段。

```json
{ "task": "ping", "input": { "message": "hi" }, "trace_id": "optional" }
```

| 字段 | 必填 |
|------|------|
| `task` | 是 |
| `input` | 是（缺必填字段 → 400） |
| `trace_id` | 否 |
| `mode` | 否，默认 `task` |

成功：

```json
{
  "request_id": "uuid",
  "mode": "task",
  "output_text": "...",
  "output_json": {},
  "output_format": "json",
  "prompt_scope": "global",
  "usage": { "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "cost": 0, "model_id": "..." },
  "balance": 0
}
```

`output_json` 解析失败为 `null`；`output_format` 为 `json|text`；`prompt_scope` 为 `global|site`。

### 预置 task

**ping** `input.message` 必填。

**apparel_image_enrich**

```json
{ "task": "apparel_image_enrich", "input": { "image_url": "https://cdn.example.com/a.jpg", "image_urls": [], "category_hint": "", "brand_voice": "", "known_specs": "" } }
```

`image_url` 必填。SDK：`enrichApparelFromImage`。  
`output_json`：`title` `short_description` `long_description` `product_type` `gender` `season` `style_tags[]` `color_name` `color_family` `pattern` `material_guess` `fabric_hand_feel` `suggested_composition` `care_instructions[]` `occasions[]` `features[]` `seo_title` `seo_description` `alt_text` `confidence` `notes[]`

**blog_topic_recommend**

```json
{ "task": "blog_topic_recommend", "input": { "site_theme": "", "target_audience": "", "primary_market": "", "existing_topics": "", "count": "8", "geo_focus": "" } }
```

`site_theme` `target_audience` 必填。SDK：`recommendBlogTopics`。  
`output_json`：`site_positioning_summary`；`topics[]`：`title` `angle` `search_intent` `primary_keyword` `secondary_keywords[]` `geo_entities[]` `faq_seeds[]` `suggested_internal_links[]` `why_it_can_rank` `priority`

**blog_seo_article**

```json
{ "task": "blog_seo_article", "input": { "site_theme": "", "target_audience": "", "topic_title": "", "primary_keyword": "", "secondary_keywords": "", "internal_link_map": "Title|/path", "brand_name": "", "word_count": "1200", "cta": "" } }
```

`site_theme` `target_audience` `topic_title` `primary_keyword` 必填。SDK：`writeBlogSeoArticle`。  
`output_json`：`title` `slug_suggestion` `meta_title` `meta_description` `excerpt` `hero_outline[]` `article_markdown` `faq[{question,answer}]` `internal_links_used[{anchor,url}]` `geo_summary_paragraph` `schema_suggestions` `editor_checklist[]`

---

## POST /run — Raw

需 `modes.can_use_raw===true`。`mode` 必须为 `"raw"`。日志 `task_code=raw`。

```json
{
  "mode": "raw",
  "model_id": "google/gemini-2.5-flash",
  "system": "",
  "prompt": "",
  "temperature": 0.7,
  "max_tokens": 2048,
  "image_urls": ["https://cdn.example.com/a.jpg"],
  "input": {},
  "trace_id": "optional"
}
```

| 字段 | 必填 |
|------|------|
| `mode` | 是，`"raw"` |
| `model_id` | 是，目录已启用 id |
| `prompt` | 是 |
| `system` | 否 |
| `temperature` | 否，0–2 |
| `max_tokens` | 否，≤16000 |
| `image_urls` | 否，最多 6 |
| `input` | 否 |
| `trace_id` | 否 |

成功同 Task，`mode="raw"`，`prompt_scope="raw"`。

---

## GET /models

OpenAI 兼容模型列表（目录已启用项）。需有效 Bearer。

```json
{
  "object": "list",
  "data": [{ "id": "google/gemini-2.5-flash", "object": "model", "owned_by": "google", "created": 0 }]
}
```

---

## POST /chat/completions

OpenAI 兼容。计费同 Raw（需 `can_use_raw`）。

视觉表单：服务商=OpenAI 兼容；`model=google/gemini-2.5-flash`；`api_key=sk_...`；`base_url=https://www.ryfs.cn/api/v1`（不要填 `/api/v1/run`）。短名如 `gemini-2.5-flash` 可解析。

```json
{
  "model": "google/gemini-2.5-flash",
  "messages": [
    { "role": "system", "content": "" },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "" },
        { "type": "image_url", "image_url": { "url": "https://cdn.example.com/a.jpg" } }
      ]
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "stream": false
}
```

纯文本可 `stream:true`（SSE `text/event-stream`，末尾 `data: [DONE]`）。带图强制非流式。

```json
{
  "id": "chatcmpl-uuid",
  "object": "chat.completion",
  "created": 0,
  "model": "google/gemini-2.5-flash",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
  "request_id": "uuid"
}
```

错误体：`{"error":{"message":"...","type":"api_error","code":"502"}}`

---

## POST /images/edits

OpenAI 兼容图片编辑。计费同 Raw（需 `can_use_raw`）。日志 `task_code=image_edit`。

业务站「OpenAI 兼容图片编辑接口」：

| 字段 | 值 |
|------|-----|
| Base URL | 优先 `https://www.ryfs.cn/api/v1`；若仍 HTML 404 改 `https://www.ryfs.cn/api`（部分客户端会再拼 `/v1/images/edits`） |
| model | `google/gemini-3.1-flash-lite-image`（短名可解析） |
| api_key | AIway `sk_...` |

实际路径：`POST .../images/edits`。兼容别名：`/api/v1/v1/images/edits`、`/api/images/edits`、`/api/v1/run/images/edits`。

`Content-Type`：`multipart/form-data`（推荐）或 `application/json`。

multipart 字段：`model` `prompt` `image`（文件，可多份）`n` `response_format`（`b64_json`|`url`）。

JSON：

```json
{
  "model": "google/gemini-3.1-flash-lite-image",
  "prompt": "Translate all visible text to Simplified Chinese. Keep layout.",
  "image": "data:image/png;base64,...",
  "n": 1,
  "response_format": "b64_json"
}
```

`image` / `images` / `image_url` / `image_urls`：公网 https URL 或 `data:image`；单图 ≤8MB。私网/localhost URL → 400。

```json
{
  "created": 0,
  "data": [{ "b64_json": "..." }],
  "model": "google/gemini-3.1-flash-lite-image",
  "request_id": "uuid"
}
```

`response_format=url` 时返回 `data[].url`（data URI，无独立托管）。错误体同 `/chat/completions`。

推荐图模：`google/gemini-3.1-flash-lite-image` `google/gemini-3.1-flash-image-preview` `google/gemini-3-pro-image` `openai/gpt-image-2`。

---

## POST /images/generations

文生图。JSON：`model` `prompt` `n` `response_format`。响应同 `/images/edits`。日志 `task_code=image_gen`。

---

## GET /account

```json
{
  "site_code": "",
  "site_name": "",
  "status": "active",
  "balance": 0,
  "held_balance": 0,
  "available": 0,
  "month_quota": null,
  "month_used": 0,
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

`available = balance - held_balance`。`can_use_raw = raw_mode_enabled && site_raw_enabled`。`status!=="active"` 或 `available<=0` 不要调 `/run`。

---

## GET /usage

Query：`from` `to`（ISO）`page` `page_size`（默认 20，最大 100）`task`（Raw 为 `raw`）。

```json
{
  "page": 1,
  "page_size": 20,
  "items": [{ "request_id": "", "task": "", "model_id": "", "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "cost": 0, "status": "", "created_at": "" }],
  "summary": { "total_calls": 0, "total_cost": 0, "total_tokens": 0 }
}
```

`GET /usage/{request_id}` 另含 `error_code` `error_message` `trace_id` `latency_ms`。

---

## 计费预扣（hold）

上游调用前会按模型单价与 `max_tokens`/图片数预扣可用余额（`held_balance`）。失败释放；成功按实际 cost 结算并释放预扣。并发超额会更早返回 402。业务站无需改请求体。

---

## 错误

`/run` `/account` `/usage`：

```json
{ "error": { "code": "402", "message": "Insufficient balance" } }
```

| HTTP | |
|------|--|
| 400 | body / 缺字段 / 非法图片 URL |
| 401 | Token |
| 402 | 余额或月额度（含预扣不足） |
| 403 | 站点停用或 Task/Raw 未开 |
| 404 | task / model / 记录 |
| 429 | 限流；响应头 `Retry-After`（秒） |
| 502 | 上游失败；`message` 含 Gateway 原文；不扣成功费 |

SDK：`AiwayError`（`status` `code` `body`）。可选 `idempotencyKey` 传入各写接口。
