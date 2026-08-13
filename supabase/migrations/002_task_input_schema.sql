-- Task input schema for business-site field contracts
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS input_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tasks.input_schema IS
  'Array of {key,label,required,example} describing /run input fields';

COMMENT ON COLUMN tasks.description IS
  'Human description of this capability for admin UI';

-- Seed clearer description/schema for demo ping task
UPDATE tasks
SET
  description = '健康检查/联调用例。业务站传 message，返回简短回声。',
  input_schema = '[
    {"key":"message","label":"测试消息","required":true,"example":"hello"}
  ]'::jsonb
WHERE task_code = 'ping';
