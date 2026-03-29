-- Bakery bookings persistence (row-based)
CREATE TABLE IF NOT EXISTS bakery_orders (
  id BIGSERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  booking_code TEXT,
  resi TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  delivery_date TEXT,
  delivery_slot TEXT,
  notes TEXT,
  base_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  add_on_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  manual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0,
  dp_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  final_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  down_payment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  product TEXT,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_status TEXT,
  order_status TEXT,
  shipping_quote JSONB,
  shipment JSONB,
  simulations JSONB,
  whatsapp_parsed_data JSONB,
  status_history JSONB,
  automation_logs JSONB,
  payment_transactions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bakery_orders_business_updated
ON bakery_orders (business_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bakery_order_items (
  id BIGSERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  order_external_id TEXT NOT NULL,
  item_index INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bakery_order_items_lookup
ON bakery_order_items (business_id, order_external_id, item_index);

CREATE TABLE IF NOT EXISTS bakery_order_addresses (
  id BIGSERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  order_external_id TEXT NOT NULL,
  address_index INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bakery_order_addresses_lookup
ON bakery_order_addresses (business_id, order_external_id, address_index);
