-- Processing chains: ordered multi-step pipelines (e.g. Cleaning → Hulling → Grading → Packing).
-- All additions are backward-compatible. Existing standalone process_runs continue to work
-- with chain_run_id and chain_step_id both NULL.

-- Chain definitions — the "routing header".
CREATE TABLE processing_chains (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  name TEXT NOT NULL,
  description TEXT,
  -- The item category this chain processes (e.g., 'paddy' for a rice pipeline)
  input_category TEXT,
  -- Expected end-to-end yield for the full chain (percentage)
  expected_yield_pct REAL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_chain_name ON processing_chains(mill_id, name) WHERE deleted_at IS NULL;

-- Chain steps — ordered entries linking a chain to its process types.
CREATE TABLE processing_chain_steps (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  chain_id TEXT NOT NULL REFERENCES processing_chains(id),
  process_type_id TEXT NOT NULL REFERENCES process_types(id),
  step_number INTEGER NOT NULL,
  -- Optional: expected yield for this step (out_base / in_base * 100)
  expected_yield_min_pct REAL,
  expected_yield_max_pct REAL,
  -- Can this step be skipped in the chain?
  optional INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_chain_step_order ON processing_chain_steps(chain_id, step_number);
CREATE INDEX idx_chain_steps_chain ON processing_chain_steps(mill_id, chain_id);

-- Chain runs — the "work order": an instance of executing a chain end-to-end.
CREATE TABLE processing_chain_runs (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  chain_id TEXT NOT NULL REFERENCES processing_chains(id),
  code TEXT NOT NULL,
  -- The step currently being executed (NULL = not started, points to chain_step.id)
  current_step_id TEXT REFERENCES processing_chain_steps(id),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS','COMPLETED','VOID','PAUSED')),
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT,
  -- Aggregate totals computed from constituent process_runs
  total_input_base REAL NOT NULL DEFAULT 0,
  total_output_base REAL NOT NULL DEFAULT 0,
  total_loss_base REAL NOT NULL DEFAULT 0,
  total_byproduct_base REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_chain_runs_mill ON processing_chain_runs(mill_id, status);

-- Link individual process runs back to their chain context. Both columns are NULL
-- for standalone process runs, preserving full backward compatibility.
ALTER TABLE process_runs ADD COLUMN chain_run_id TEXT REFERENCES processing_chain_runs(id);
ALTER TABLE process_runs ADD COLUMN chain_step_id TEXT REFERENCES processing_chain_steps(id);

-- Backfill: give every existing mill that has process types a default "Rice Milling Pipeline"
-- chain linking their standard 6 steps in order.
INSERT INTO processing_chains (id, mill_id, name, description, input_category, expected_yield_pct)
SELECT 'chain-default-' || m.id, m.id, 'Rice Milling Pipeline',
       'Default end-to-end rice milling chain: Pre-Cleaning through Packaging.',
       'paddy', 67.0
FROM mills m
WHERE EXISTS (SELECT 1 FROM process_types p WHERE p.mill_id = m.id AND p.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM processing_chains c WHERE c.mill_id = m.id AND c.deleted_at IS NULL);

-- Link the 6 default process types as ordered steps. Uses name matching to handle
-- mills that may have renamed or deleted some types.
INSERT INTO processing_chain_steps (id, mill_id, chain_id, process_type_id, step_number)
SELECT lower(hex(randomblob(16))), p.mill_id, 'chain-default-' || p.mill_id, p.id,
  CASE p.name
    WHEN 'Pre-Cleaning' THEN 1
    WHEN 'De-husking (Hulling)' THEN 2
    WHEN 'Paddy Separation' THEN 3
    WHEN 'Whitening and Polishing' THEN 4
    WHEN 'Grading and Color Sorting' THEN 5
    WHEN 'Weighing and Packaging' THEN 6
  END
FROM process_types p
WHERE p.deleted_at IS NULL
  AND p.name IN ('Pre-Cleaning', 'De-husking (Hulling)', 'Paddy Separation',
                 'Whitening and Polishing', 'Grading and Color Sorting', 'Weighing and Packaging')
  AND EXISTS (SELECT 1 FROM processing_chains c WHERE c.id = 'chain-default-' || p.mill_id);
