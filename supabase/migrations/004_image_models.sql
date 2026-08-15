-- Image generation / edit models for OpenAI-compatible /images/* routes

INSERT INTO model_catalog (model_id, display_name, input_price_per_1m, output_price_per_1m, enabled)
VALUES
  ('google/gemini-3.1-flash-lite-image', 'Gemini 3.1 Flash Lite Image', 0.25, 1.50, TRUE),
  ('google/gemini-3.1-flash-image-preview', 'Gemini 3.1 Flash Image Preview', 0.30, 2.50, TRUE),
  ('google/gemini-3-pro-image', 'Gemini 3 Pro Image', 1.25, 10.00, TRUE),
  ('google/gemini-2.5-flash-image', 'Gemini 2.5 Flash Image', 0.30, 2.50, TRUE),
  ('openai/gpt-image-2', 'GPT Image 2', 5.00, 30.00, TRUE)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1m = EXCLUDED.input_price_per_1m,
  output_price_per_1m = EXCLUDED.output_price_per_1m,
  enabled = TRUE,
  updated_at = NOW();
