-- Mill Intelligence (Beta): manual operational readings — settings, drying, QC, gunny bags.
-- Observations only; no stock ledger or production output changes.

CREATE TABLE mill_intelligence_settings (
  mill_id TEXT PRIMARY KEY REFERENCES mills(id),
  otr_target_pct REAL,
  otr_alert_delta_pct REAL,
  moisture_min_pct REAL,
  moisture_max_pct REAL,
  head_rice_min_pct REAL,
  broken_rice_max_pct REAL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE drying_readings (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  lot_id TEXT REFERENCES lots(id),
  process_run_id TEXT REFERENCES process_runs(id),
  stage TEXT NOT NULL CHECK (stage IN ('INTAKE','AFTER_DRYER','PRE_MILLING','OTHER')),
  moisture_pct REAL NOT NULL CHECK (moisture_pct >= 0 AND moisture_pct <= 100),
  recorded_at TEXT NOT NULL,
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (lot_id IS NOT NULL OR process_run_id IS NOT NULL)
);
CREATE INDEX idx_drying_readings_mill ON drying_readings(mill_id, recorded_at DESC);
CREATE INDEX idx_drying_readings_lot ON drying_readings(mill_id, lot_id);
CREATE INDEX idx_drying_readings_run ON drying_readings(mill_id, process_run_id);

CREATE TABLE quality_checks (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  process_run_id TEXT NOT NULL REFERENCES process_runs(id),
  checked_at TEXT NOT NULL,
  shift TEXT,
  head_rice_pct REAL NOT NULL CHECK (head_rice_pct >= 0 AND head_rice_pct <= 100),
  broken_rice_pct REAL NOT NULL CHECK (broken_rice_pct >= 0 AND broken_rice_pct <= 100),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (head_rice_pct + broken_rice_pct <= 100)
);
CREATE INDEX idx_quality_checks_mill ON quality_checks(mill_id, checked_at DESC);
CREATE INDEX idx_quality_checks_run ON quality_checks(mill_id, process_run_id);

CREATE TABLE gunny_bag_movements (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  gate_entry_id TEXT REFERENCES gate_entries(id),
  bag_type TEXT NOT NULL CHECK (bag_type IN ('JUTE','PP','OTHER')),
  capacity_kg INTEGER,
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  reason TEXT NOT NULL CHECK (reason IN ('RECEIVED','ISSUED','RETURNED','DAMAGED','MISSING','ADJUSTMENT')),
  bag_count INTEGER NOT NULL CHECK (bag_count > 0),
  movement_date TEXT NOT NULL,
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (capacity_kg IS NULL OR capacity_kg > 0)
);
CREATE INDEX idx_gunny_movements_mill ON gunny_bag_movements(mill_id, movement_date DESC);
CREATE INDEX idx_gunny_movements_gate ON gunny_bag_movements(mill_id, gate_entry_id);
