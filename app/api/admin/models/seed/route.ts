import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api/errors";
import { invalidateCatalogCache } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/** Customer-facing catalog entries for Vercel AI Gateway model IDs. */
export const DEFAULT_MODEL_SEEDS = [
  { model_id: "openai/gpt-4o-mini", display_name: "GPT-4o Mini", input: 0.15, output: 0.6 },
  { model_id: "openai/gpt-4o", display_name: "GPT-4o", input: 2.5, output: 10 },
  { model_id: "openai/gpt-4.1-mini", display_name: "GPT-4.1 Mini", input: 0.4, output: 1.6 },
  { model_id: "openai/gpt-4.1", display_name: "GPT-4.1", input: 2, output: 8 },
  { model_id: "anthropic/claude-sonnet-4", display_name: "Claude Sonnet 4", input: 3, output: 15 },
  { model_id: "anthropic/claude-haiku-4.5", display_name: "Claude Haiku 4.5", input: 1, output: 5 },
  { model_id: "deepseek/deepseek-v4-flash", display_name: "DeepSeek V4 Flash", input: 0.05, output: 0.1 },
  { model_id: "deepseek/deepseek-v4-pro", display_name: "DeepSeek V4 Pro", input: 0.4, output: 1.2 },
  { model_id: "deepseek/deepseek-v3.2", display_name: "DeepSeek V3.2", input: 0.28, output: 0.42 },
  {
    model_id: "deepseek/deepseek-v3.2-thinking",
    display_name: "DeepSeek V3.2 Thinking",
    input: 0.28,
    output: 0.42,
  },
  { model_id: "deepseek/deepseek-v3.1", display_name: "DeepSeek V3.1", input: 0.2, output: 0.8 },
  {
    model_id: "deepseek/deepseek-v3.1-terminus",
    display_name: "DeepSeek V3.1 Terminus",
    input: 0.2,
    output: 0.8,
  },
  { model_id: "deepseek/deepseek-v3", display_name: "DeepSeek V3", input: 0.27, output: 1.1 },
  { model_id: "deepseek/deepseek-r1", display_name: "DeepSeek R1", input: 0.55, output: 2.19 },
  { model_id: "google/gemini-2.0-flash", display_name: "Gemini 2.0 Flash", input: 0.1, output: 0.4 },
  {
    model_id: "google/gemini-2.0-flash-lite",
    display_name: "Gemini 2.0 Flash Lite",
    input: 0.075,
    output: 0.3,
  },
  { model_id: "google/gemini-2.5-flash", display_name: "Gemini 2.5 Flash", input: 0.3, output: 2.5 },
  {
    model_id: "google/gemini-2.5-flash-lite",
    display_name: "Gemini 2.5 Flash Lite",
    input: 0.1,
    output: 0.4,
  },
  { model_id: "google/gemini-2.5-pro", display_name: "Gemini 2.5 Pro", input: 1.25, output: 10 },
  { model_id: "google/gemini-3-flash", display_name: "Gemini 3 Flash", input: 0.5, output: 3 },
  { model_id: "google/gemini-3.5-flash", display_name: "Gemini 3.5 Flash", input: 0.5, output: 3 },
  {
    model_id: "google/gemini-3.1-pro-preview",
    display_name: "Gemini 3.1 Pro Preview",
    input: 2,
    output: 12,
  },
  {
    model_id: "google/gemini-3.1-flash-lite-image",
    display_name: "Gemini 3.1 Flash Lite Image",
    input: 0.25,
    output: 1.5,
  },
  {
    model_id: "google/gemini-3.1-flash-image-preview",
    display_name: "Gemini 3.1 Flash Image Preview",
    input: 0.3,
    output: 2.5,
  },
  {
    model_id: "google/gemini-3-pro-image",
    display_name: "Gemini 3 Pro Image",
    input: 1.25,
    output: 10,
  },
  {
    model_id: "google/gemini-2.5-flash-image",
    display_name: "Gemini 2.5 Flash Image",
    input: 0.3,
    output: 2.5,
  },
  { model_id: "openai/gpt-image-2", display_name: "GPT Image 2", input: 5, output: 30 },
] as const;

export async function POST() {
  try {
    await requireAdmin();
    const sql = getSql();
    let upserted = 0;

    for (const m of DEFAULT_MODEL_SEEDS) {
      await sql`
        INSERT INTO model_catalog (model_id, display_name, input_price_per_1m, output_price_per_1m, enabled)
        VALUES (${m.model_id}, ${m.display_name}, ${m.input}, ${m.output}, TRUE)
        ON CONFLICT (model_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          input_price_per_1m = EXCLUDED.input_price_per_1m,
          output_price_per_1m = EXCLUDED.output_price_per_1m,
          enabled = TRUE,
          updated_at = NOW()
      `;
      upserted += 1;
    }

    const rows = await sql`SELECT * FROM model_catalog ORDER BY model_id`;
    invalidateCatalogCache();
    return jsonOk({
      upserted,
      items: rows,
      tip: "已写入 DeepSeek / Gemini / OpenAI / Anthropic / 图片编辑模型。单价为对客户售价，可按需再改。",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
