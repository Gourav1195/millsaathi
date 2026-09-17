-- MillSaathi SaaS billing is intentionally separate from operational mill payments.
CREATE TABLE billing_accounts (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL UNIQUE REFERENCES mills(id),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_customer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE billing_subscriptions (
  id TEXT PRIMARY KEY,
  billing_account_id TEXT NOT NULL REFERENCES billing_accounts(id),
  provider_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE billing_events (
  id TEXT PRIMARY KEY,
  billing_account_id TEXT REFERENCES billing_accounts(id),
  provider_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
