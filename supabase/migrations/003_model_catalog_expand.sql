-- Expand model catalog: DeepSeek + Gemini (+ keep existing OpenAI/Anthropic)

INSERT INTO model_catalog (model_id, display_name, input_price_per_1m, output_price_per_1m, enabled)
VALUES
  -- DeepSeek
  ('deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash', 0.05, 0.10, TRUE),
  ('deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro', 0.40, 1.20, TRUE),
  ('deepseek/deepseek-v3.2', 'DeepSeek V3.2', 0.28, 0.42, TRUE),
  ('deepseek/deepseek-v3.2-thinking', 'DeepSeek V3.2 Thinking', 0.28, 0.42, TRUE),
  ('deepseek/deepseek-v3.1', 'DeepSeek V3.1', 0.20, 0.80, TRUE),
  ('deepseek/deepseek-v3.1-terminus', 'DeepSeek V3.1 Terminus', 0.20, 0.80, TRUE),
  ('deepseek/deepseek-v3', 'DeepSeek V3', 0.27, 1.10, TRUE),
  ('deepseek/deepseek-r1', 'DeepSeek R1', 0.55, 2.19, TRUE),

  -- Google Gemini
  ('google/gemini-2.0-flash', 'Gemini 2.0 Flash', 0.10, 0.40, TRUE),
  ('google/gemini-2.0-flash-lite', 'Gemini 2.0 Flash Lite', 0.075, 0.30, TRUE),
  ('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 0.30, 2.50, TRUE),
  ('google/gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 0.10, 0.40, TRUE),
  ('google/gemini-2.5-pro', 'Gemini 2.5 Pro', 1.25, 10.00, TRUE),
  ('google/gemini-3-flash', 'Gemini 3 Flash', 0.50, 3.00, TRUE),
  ('google/gemini-3.5-flash', 'Gemini 3.5 Flash', 0.50, 3.00, TRUE),
  ('google/gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 2.00, 12.00, TRUE),

  -- Extra common OpenAI / Anthropic (if missing)
  ('openai/gpt-4.1-mini', 'GPT-4.1 Mini', 0.40, 1.60, TRUE),
  ('openai/gpt-4.1', 'GPT-4.1', 2.00, 8.00, TRUE),
  ('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 1.00, 5.00, TRUE)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1m = EXCLUDED.input_price_per_1m,
  output_price_per_1m = EXCLUDED.output_price_per_1m,
  enabled = TRUE,
  updated_at = NOW();
