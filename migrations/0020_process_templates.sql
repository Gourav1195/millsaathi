-- Configurable process recipes. Existing process types remain valid without rows here.
CREATE TABLE process_type_lines (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  process_type_id TEXT NOT NULL REFERENCES process_types(id),
  line_type TEXT NOT NULL CHECK (line_type IN ('INPUT','OUTPUT','LOSS')),
  semantic_type TEXT NOT NULL CHECK (semantic_type IN ('input','main','byproduct','waste')),
  item_id TEXT REFERENCES items(id),
  default_unit TEXT,
  default_godown_id TEXT REFERENCES godowns(id),
  required INTEGER NOT NULL DEFAULT 1,
  auto_calculate INTEGER NOT NULL DEFAULT 0,
  expected_yield_min_pct REAL,
  expected_yield_max_pct REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_process_type_lines_type ON process_type_lines(mill_id, process_type_id, active, sort_order);
CREATE INDEX idx_process_type_lines_item ON process_type_lines(mill_id, item_id);

ALTER TABLE process_types ADD COLUMN default_unit TEXT;
ALTER TABLE process_types ADD COLUMN default_destination_godown_id TEXT REFERENCES godowns(id);

ALTER TABLE process_run_lines ADD COLUMN semantic_type TEXT;
ALTER TABLE process_run_lines ADD COLUMN template_line_id TEXT REFERENCES process_type_lines(id);
