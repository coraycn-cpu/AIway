# 给另一个 Cursor 业务站项目用

不必把整份文档手工复制进业务站仓库。生产域名：**https://www.ryfs.cn**

## 方式 A（推荐）：粘贴提示词 + 公网 URL

在业务站 Cursor 对话中粘贴：

```text
请按 AIway 接入文档完成本业务站服务端对接（Token 只放服务端，禁止 NEXT_PUBLIC_*）。

生产域名：https://www.ryfs.cn

文档：
https://www.ryfs.cn/api/docs/business-integration

SDK（下载保存为 lib/aiway-client.ts）：
https://www.ryfs.cn/sdk/aiway-client.ts

可视化说明页：
https://www.ryfs.cn/integration

环境变量：
AI_SCHEDULER_URL=https://www.ryfs.cn/api/v1
AI_SCHEDULER_TOKEN=<管理员发放的 sk_xxx>

Open API：
POST https://www.ryfs.cn/api/v1/run
POST https://www.ryfs.cn/api/v1/chat/completions   （OpenAI 兼容视觉接口：Base URL 填 https://www.ryfs.cn/api/v1）
GET  https://www.ryfs.cn/api/v1/account
GET  https://www.ryfs.cn/api/v1/usage

实现要求：
1) 用官方 SDK（runTaskJson / getAccount / runRawJson 等），不要手写半截 fetch
2) 先 GET /account 探活，确认 status=active 与 balance
3) 若只用 Raw（不写任务）：确认 modes.can_use_raw=true，用 runRaw / runRawJson，请求必须带 mode:"raw" 和 model_id
4) 若用 Task：runTaskJson({ task:"ping", input:{ message:"hi" } })，再接预置能力
5) 解析优先用 output_json 或 runTaskJson / runRawJson（兼容 ```json 围栏），禁止只 JSON.parse(output_text)
6) 错误用 AiwayError 处理；402 提示充值；403 检查模式开关或站点停用
```

Cursor Agent 可用 WebFetch 拉取上述 Markdown/SDK 后直接改业务站代码。

## 方式 B：GitHub 原始文件

```text
https://raw.githubusercontent.com/coraycn-cpu/AIway/cursor/v1-ai-scheduler-e1cf/docs/BUSINESS-SITE-INTEGRATION.md
https://raw.githubusercontent.com/coraycn-cpu/AIway/cursor/v1-ai-scheduler-e1cf/public/sdk/aiway-client.ts
```

## 方式 C：直接下载 SDK

```bash
curl -fsSL "https://www.ryfs.cn/sdk/aiway-client.ts" -o lib/aiway-client.ts
```

---

管理员给业务站时，最少提供：

1. `AI_SCHEDULER_URL=https://www.ryfs.cn/api/v1`
2. `AI_SCHEDULER_TOKEN`
3. 上面「方式 A」整段提示词
4. （若需 Raw）确认已开全局 Raw + 该站 Raw
