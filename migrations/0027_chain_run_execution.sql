-- Chain run execution: DRAFT lifecycle, per-run step snapshots, lot disposition.

-- Rebuild processing_chain_runs to add DRAFT status and new columns.
CREATE TABLE processing_chain_runs_new (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  chain_id TEXT NOT NULL REFERENCES processing_chains(id),
  code TEXT NOT NULL,
  current_step_id TEXT REFERENCES processing_chain_steps(id),
  current_run_step_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','IN_PROGRESS','COMPLETED','VOID','PAUSED')),
  start_date TEXT NOT NULL DEFAULT (date('now')),
  started_at TEXT,
  end_date TEXT,
  unit TEXT,
  planned_input_base REAL NOT NULL DEFAULT 0,
  total_input_base REAL NOT NULL DEFAULT 0,
  total_output_base REAL NOT NULL DEFAULT 0,
  total_loss_base REAL NOT NULL DEFAULT 0,
  total_byproduct_base REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO processing_chain_runs_new (
  id, mill_id, chain_id, code, current_step_id, status, start_date, end_date,
  total_input_base, total_output_base, total_loss_base, total_byproduct_base,
  notes, created_by, created_at
)
SELECT
  id, mill_id, chain_id, code, current_step_id, status, start_date, end_date,
  total_input_base, total_output_base, total_loss_base, total_byproduct_base,
  notes, created_by, created_at
FROM processing_chain_runs;
DROP TABLE processing_chain_runs;
ALTER TABLE processing_chain_runs_new RENAME TO processing_chain_runs;
CREATE INDEX idx_chain_runs_mill ON processing_chain_runs(mill_id, status);

-- Per-run step snapshot (deviations from chain template stay here).
CREATE TABLE processing_chain_run_steps (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  chain_run_id TEXT NOT NULL REFERENCES processing_chain_runs(id),
  step_number INTEGER NOT NULL,
  process_type_id TEXT NOT NULL REFERENCES process_types(id),
  process_type_name TEXT,
  source_chain_step_id TEXT REFERENCES processing_chain_steps(id),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACTIVE','COMPLETED','SKIPPED')),
  forecast_input_base REAL NOT NULL DEFAULT 0,
  forecast_main_base REAL NOT NULL DEFAULT 0,
  actual_input_base REAL,
  actual_main_base REAL,
  process_run_id TEXT REFERENCES process_runs(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_chain_run_step_order ON processing_chain_run_steps(chain_run_id, step_number);
CREATE INDEX idx_chain_run_steps_run ON processing_chain_run_steps(mill_id, chain_run_id);

-- Forecast and actual lines per run step.
CREATE TABLE processing_chain_run_step_lines (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  run_step_id TEXT NOT NULL REFERENCES processing_chain_run_steps(id),
  kind TEXT NOT NULL CHECK (kind IN ('main','byproduct','loss')),
  item_id TEXT REFERENCES items(id),
  item_name TEXT,
  expected_pct REAL,
  expected_min_pct REAL,
  expected_max_pct REAL,
  forecast_base REAL NOT NULL DEFAULT 0,
  actual_base REAL,
  godown_id TEXT REFERENCES godowns(id),
  lot_id TEXT REFERENCES lots(id),
  rate_paise_per_kg INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_chain_run_step_lines_step ON processing_chain_run_step_lines(mill_id, run_step_id);

-- Link process runs to per-run steps.
ALTER TABLE process_runs ADD COLUMN chain_run_step_id TEXT REFERENCES processing_chain_run_steps(id);

-- Lot disposition for byproduct sale/reuse.
ALTER TABLE lots ADD COLUMN disposition TEXT NOT NULL DEFAULT 'STOCK'
  CHECK (disposition IN ('STOCK','FOR_SALE','FOR_REUSE'));
ALTER TABLE lots ADD COLUMN parent_lot_id TEXT REFERENCES lots(id);
