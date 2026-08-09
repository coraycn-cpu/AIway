# 给另一个 Cursor 业务站项目用

不必把整份文档手工复制进业务站仓库。用下面任一方式「直接调用」。

## 方式 A（推荐）：粘贴提示词 + 公网 URL

在业务站 Cursor 对话中粘贴：

```text
请按 AIway 接入文档完成本业务站服务端对接（Token 只放服务端，禁止 NEXT_PUBLIC_*）。

文档：
https://ai-way-git-cursor-v1-ai-scheduler-e1cf-coraycn-6000s-projects.vercel.app/api/docs/business-integration

SDK（下载保存为 lib/aiway-client.ts）：
https://ai-way-git-cursor-v1-ai-scheduler-e1cf-coraycn-6000s-projects.vercel.app/sdk/aiway-client.ts

可视化说明页：
https://ai-way-git-cursor-v1-ai-scheduler-e1cf-coraycn-6000s-projects.vercel.app/integration

环境变量：
AI_SCHEDULER_URL=https://ai-way-git-cursor-v1-ai-scheduler-e1cf-coraycn-6000s-projects.vercel.app/api/v1
AI_SCHEDULER_TOKEN=<管理员发放的 sk_xxx>

实现要求：
1) 用官方 SDK（runTaskJson / getAccount 等），不要手写半截 fetch
2) 先 GET /account 探活，确认 status=active 与 balance
3) runTaskJson({ task:"ping", input:{ message:"hi" } })
4) 再接业务：enrichApparelFromImage / recommendBlogTopics / writeBlogSeoArticle
5) 解析优先用 output_json 或 runTaskJson（兼容 ```json 围栏），禁止只 JSON.parse(output_text)
6) 双模式：默认 Task。若 modes.can_use_raw=true，可用 runRaw / runRawJson 自带提示词，仍由 AIway 扣费
7) 错误用 AiwayError 处理；402 提示充值；403 检查模式开关或站点停用
```

Cursor Agent 可用 WebFetch 拉取上述 Markdown/SDK 后直接改业务站代码。

## 方式 B：GitHub 原始文件

```text
https://raw.githubusercontent.com/coraycn-cpu/AIway/cursor/v1-ai-scheduler-e1cf/docs/BUSINESS-SITE-INTEGRATION.md
https://raw.githubusercontent.com/coraycn-cpu/AIway/cursor/v1-ai-scheduler-e1cf/public/sdk/aiway-client.ts
```

## 方式 C：同一机器多仓库

```bash
curl -fsSL "<AIWAY_HOST>/sdk/aiway-client.ts" -o lib/aiway-client.ts
```

---

管理员给业务站时，最少提供：

1. `AI_SCHEDULER_URL`
2. `AI_SCHEDULER_TOKEN`
3. 上面「方式 A」整段提示词
4. （若需 Raw）确认已开全局 Raw + 该站 Raw
