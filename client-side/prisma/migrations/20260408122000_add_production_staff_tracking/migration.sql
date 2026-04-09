ALTER TABLE bakery_orders
ADD COLUMN IF NOT EXISTS assigned_staff_user_id INTEGER;

ALTER TABLE bakery_orders
ADD COLUMN IF NOT EXISTS assigned_staff_name TEXT;

ALTER TABLE bakery_orders
ADD COLUMN IF NOT EXISTS production_assigned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS bakery_staff_monthly_token_resets (
  id BIGSERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  staff_user_id INTEGER NOT NULL,
  month_key TEXT NOT NULL,
  baseline_token INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, staff_user_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_bakery_staff_monthly_token_resets_lookup
ON bakery_staff_monthly_token_resets (business_id, month_key, staff_user_id);
