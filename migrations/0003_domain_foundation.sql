-- Domain foundation. All additions are backward-compatible with the V1 schema.

ALTER TABLE items ADD COLUMN category_code TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE items ADD COLUMN base_unit TEXT NOT NULL DEFAULT 'KG';
ALTER TABLE items ADD COLUMN display_unit TEXT;
ALTER TABLE items ADD COLUMN package_unit TEXT;
ALTER TABLE items ADD COLUMN package_quantity_base REAL;
ALTER TABLE items ADD COLUMN deleted_at TEXT;
ALTER TABLE items ADD COLUMN deleted_by TEXT;

ALTER TABLE suppliers ADD COLUMN email TEXT;
ALTER TABLE suppliers ADD COLUMN gstin TEXT;
ALTER TABLE suppliers ADD COLUMN address TEXT;
ALTER TABLE suppliers ADD COLUMN deleted_at TEXT;
ALTER TABLE suppliers ADD COLUMN deleted_by TEXT;
ALTER TABLE buyers ADD COLUMN email TEXT;
ALTER TABLE buyers ADD COLUMN gstin TEXT;
ALTER TABLE buyers ADD COLUMN address TEXT;
ALTER TABLE buyers ADD COLUMN deleted_at TEXT;
ALTER TABLE buyers ADD COLUMN deleted_by TEXT;

ALTER TABLE godowns ADD COLUMN capacity_qty REAL;
ALTER TABLE godowns ADD COLUMN capacity_unit TEXT NOT NULL DEFAULT 'QUINTAL';
ALTER TABLE godowns ADD COLUMN location TEXT;
ALTER TABLE godowns ADD COLUMN description TEXT;
ALTER TABLE godowns ADD COLUMN notes TEXT;
ALTER TABLE godowns ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

ALTER TABLE saudas ADD COLUMN direction TEXT NOT NULL DEFAULT 'in';
ALTER TABLE saudas ADD COLUMN agreement_date TEXT;
ALTER TABLE saudas ADD COLUMN delivery_start TEXT;
ALTER TABLE saudas ADD COLUMN delivery_end TEXT;
ALTER TABLE saudas ADD COLUMN broker_id TEXT;
ALTER TABLE saudas ADD COLUMN commission_type TEXT;
ALTER TABLE saudas ADD COLUMN commission_value REAL;
ALTER TABLE saudas ADD COLUMN commission_paise INTEGER;
ALTER TABLE saudas ADD COLUMN fulfilment_status TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE saudas ADD COLUMN delivery_tolerance_pct REAL NOT NULL DEFAULT 5.0;

CREATE TABLE sauda_deliveries (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  sauda_id TEXT NOT NULL REFERENCES saudas(id),
  gate_entry_id TEXT REFERENCES gate_entries(id),
  actual_qty REAL NOT NULL DEFAULT 0,
  actual_unit TEXT NOT NULL DEFAULT 'KG',
  actual_qty_base REAL NOT NULL DEFAULT 0,
  actual_weight_kg INTEGER,
  actual_date TEXT NOT NULL DEFAULT (date('now')),
  quality_json TEXT,
  godown_id TEXT REFERENCES godowns(id),
  lot_id TEXT REFERENCES lots(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sauda_deliveries_mill ON sauda_deliveries(mill_id, sauda_id);

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT','ADJUSTMENT')),
  item_id TEXT NOT NULL REFERENCES items(id),
  godown_id TEXT REFERENCES godowns(id),
  lot_id TEXT REFERENCES lots(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  quantity_base REAL NOT NULL,
  base_unit TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  movement_date TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','VOID')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  voided_at TEXT,
  voided_by TEXT
);
CREATE INDEX idx_stock_movements_mill_item ON stock_movements(mill_id, item_id, status);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  actor_id TEXT REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_events_entity ON audit_events(mill_id, entity_type, entity_id, created_at);

ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN invited_by TEXT;
ALTER TABLE users ADD COLUMN invite_token_hash TEXT;
ALTER TABLE users ADD COLUMN invite_expires_at TEXT;

CREATE TABLE process_types (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_process_types_name ON process_types(mill_id, name) WHERE deleted_at IS NULL;

CREATE TABLE process_runs (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  process_type_id TEXT NOT NULL REFERENCES process_types(id),
  run_date TEXT NOT NULL DEFAULT (date('now')),
  shift TEXT,
  operator_id TEXT REFERENCES users(id),
  source_lot_id TEXT REFERENCES lots(id),
  destination_godown_id TEXT REFERENCES godowns(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','VOID')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE process_run_lines (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  run_id TEXT NOT NULL REFERENCES process_runs(id),
  line_type TEXT NOT NULL CHECK (line_type IN ('INPUT','OUTPUT','LOSS')),
  item_id TEXT NOT NULL REFERENCES items(id),
  lot_id TEXT REFERENCES lots(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  quantity_base REAL NOT NULL,
  base_unit TEXT NOT NULL,
  godown_id TEXT REFERENCES godowns(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_process_lines_run ON process_run_lines(mill_id, run_id);

-- Preserve current units and capacity in the new explicit fields.
UPDATE items SET category_code = CASE category WHEN 'paddy' THEN 'RAW_MATERIAL' WHEN 'rice' THEN 'FINISHED_GOOD' WHEN 'byproduct' THEN 'BYPRODUCT' ELSE 'OTHER' END,
  display_unit = 'QUINTAL' WHERE category_code = 'OTHER';
UPDATE godowns SET capacity_qty = capacity_qtl WHERE capacity_qty IS NULL;
