-- MillSaathi V1 schema. Conventions:
-- ids are UUIDs (TEXT); weights are integer kg; money is integer paise; dates are ISO strings.
-- Every business table is scoped by mill_id — queries must always filter on it.

CREATE TABLE mills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','professional','enterprise')),
  language TEXT NOT NULL DEFAULT 'en',
  loss_limit_pct REAL NOT NULL DEFAULT 3.0,
  season_label TEXT NOT NULL DEFAULT 'Kharif season',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','accountant','operator')),
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_users_mill ON users(mill_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'farmer' CHECK (type IN ('farmer','trader','broker')),
  place TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_suppliers_mill ON suppliers(mill_id);

CREATE TABLE buyers (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'wholesaler',
  location TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_buyers_mill ON buyers(mill_id);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('paddy','rice','byproduct')),
  hsn TEXT,
  unit TEXT NOT NULL DEFAULT 'Quintal',
  typical_otr_pct REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_items_mill ON items(mill_id);

CREATE TABLE godowns (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  capacity_qtl INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_godowns_mill ON godowns(mill_id);

CREATE TABLE saudas (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  code TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  broker_name TEXT NOT NULL DEFAULT 'Direct',
  item_id TEXT REFERENCES items(id),
  qty_kg INTEGER NOT NULL DEFAULT 0,
  rate_paise_per_qtl INTEGER NOT NULL DEFAULT 0,
  moisture_pct REAL,
  advance_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','advance_paid','settled','disputed')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_saudas_mill ON saudas(mill_id);

CREATE TABLE gate_entries (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  token_no TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
  vehicle_no TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  buyer_id TEXT REFERENCES buyers(id),
  item_id TEXT REFERENCES items(id),
  sauda_id TEXT REFERENCES saudas(id),
  gross_kg INTEGER,
  tare_kg INTEGER,
  moisture_pct REAL,
  rate_paise_per_qtl INTEGER,
  status TEXT NOT NULL DEFAULT 'at_gate'
    CHECK (status IN ('at_gate','weighing','in_lab','weighed','unloading','done')),
  entry_date TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_gate_mill_date ON gate_entries(mill_id, entry_date);

CREATE TABLE lots (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  code TEXT NOT NULL,
  godown_id TEXT REFERENCES godowns(id),
  item_id TEXT REFERENCES items(id),
  qty_kg INTEGER NOT NULL DEFAULT 0,
  moisture_pct REAL,
  in_date TEXT NOT NULL DEFAULT (date('now')),
  value_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_lots_mill ON lots(mill_id);

CREATE TABLE production_runs (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  run_date TEXT NOT NULL DEFAULT (date('now')),
  paddy_in_kg INTEGER NOT NULL DEFAULT 0,
  rice_out_kg INTEGER NOT NULL DEFAULT 0,
  bran_out_kg INTEGER NOT NULL DEFAULT 0,
  husk_out_kg INTEGER NOT NULL DEFAULT 0,
  broken_out_kg INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_prod_mill_date ON production_runs(mill_id, run_date);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  party_kind TEXT NOT NULL CHECK (party_kind IN ('supplier','buyer')),
  party_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('paid','received')),
  amount_paise INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  pay_date TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_payments_mill ON payments(mill_id);

-- Per-mill sequence counters for human-friendly codes (TKN-…, SAU-…, LOT-…).
CREATE TABLE counters (
  mill_id TEXT NOT NULL REFERENCES mills(id),
  key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mill_id, key)
);
