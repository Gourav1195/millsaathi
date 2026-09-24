-- QC samples during active milling: link to chain run or source lot; process run optional after posting.

CREATE TABLE quality_checks_new (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  process_run_id TEXT REFERENCES process_runs(id),
  lot_id TEXT REFERENCES lots(id),
  chain_run_id TEXT REFERENCES processing_chain_runs(id),
  checked_at TEXT NOT NULL,
  shift TEXT,
  head_rice_pct REAL NOT NULL CHECK (head_rice_pct >= 0 AND head_rice_pct <= 100),
  broken_rice_pct REAL NOT NULL CHECK (broken_rice_pct >= 0 AND broken_rice_pct <= 100),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (head_rice_pct + broken_rice_pct <= 100),
  CHECK (process_run_id IS NOT NULL OR lot_id IS NOT NULL OR chain_run_id IS NOT NULL)
);

INSERT INTO quality_checks_new (
  id, mill_id, process_run_id, lot_id, chain_run_id, checked_at, shift,
  head_rice_pct, broken_rice_pct, note, created_by, created_at
)
SELECT
  id, mill_id, process_run_id, NULL, NULL, checked_at, shift,
  head_rice_pct, broken_rice_pct, note, created_by, created_at
FROM quality_checks;

DROP TABLE quality_checks;
ALTER TABLE quality_checks_new RENAME TO quality_checks;

CREATE INDEX idx_quality_checks_mill ON quality_checks(mill_id, checked_at DESC);
CREATE INDEX idx_quality_checks_run ON quality_checks(mill_id, process_run_id);
CREATE INDEX idx_quality_checks_lot ON quality_checks(mill_id, lot_id);
CREATE INDEX idx_quality_checks_chain ON quality_checks(mill_id, chain_run_id);
