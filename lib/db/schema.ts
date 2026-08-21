export type SiteStatus = "active" | "disabled";
export type AccountStatus = "active" | "disabled";
export type TokenStatus = "active" | "revoked";
export type TaskStatus = "active" | "disabled";
export type UsageStatus = "success" | "error" | "rejected";
export type LedgerType = "recharge" | "charge" | "adjust";

export type AdminUser = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: Date;
};

export type Site = {
  id: string;
  code: string;
  name: string;
  status: SiteStatus;
  raw_enabled?: boolean;
  created_at: Date;
  updated_at: Date;
};

export type Account = {
  id: string;
  site_id: string;
  balance: string;
  held_balance?: string;
  month_quota: string | null;
  status: AccountStatus;
  created_at: Date;
  updated_at: Date;
};

export type ApiToken = {
  id: string;
  site_id: string;
  account_id: string;
  token_hash: string;
  prefix: string;
  name: string | null;
  status: TokenStatus;
  last_used_at: Date | null;
  created_at: Date;
};

export type Task = {
  id: string;
  task_code: string;
  name: string;
  description: string | null;
  default_model_id: string;
  temperature: string;
  max_tokens: number;
  status: TaskStatus;
  input_schema: unknown;
  created_at: Date;
  updated_at: Date;
};

export type PromptTemplate = {
  id: string;
  task_id: string;
  site_id: string | null;
  system_template: string;
  user_template: string;
  version: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type ModelCatalog = {
  id: string;
  model_id: string;
  display_name: string;
  input_price_per_1m: string;
  output_price_per_1m: string;
  min_cost_per_call?: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

export type UsageLog = {
  id: string;
  request_id: string;
  site_id: string;
  account_id: string;
  task_id: string | null;
  task_code: string | null;
  model_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: string;
  status: UsageStatus;
  error_code: string | null;
  error_message: string | null;
  trace_id: string | null;
  latency_ms: number | null;
  created_at: Date;
};

export type BalanceLedger = {
  id: string;
  account_id: string;
  site_id: string;
  type: LedgerType;
  amount: string;
  balance_after: string;
  usage_log_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Date;
};
