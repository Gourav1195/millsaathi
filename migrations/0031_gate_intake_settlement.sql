-- Structured truck intake settlement: rejected bags and accepted bags at negotiated rates.

CREATE TABLE gate_intake_lines (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  gate_entry_id TEXT NOT NULL REFERENCES gate_entries(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL CHECK (outcome IN ('REJECTED', 'ACCEPTED')),
  bag_count INTEGER,
  qty_kg INTEGER NOT NULL,
  rate_paise_per_qtl INTEGER,
  rate_paise_per_bag INTEGER,
  rate_unit TEXT NOT NULL DEFAULT 'QTL' CHECK (rate_unit IN ('QTL', 'BAG')),
  reason TEXT,
  lot_id TEXT REFERENCES lots(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_gate_intake_lines_gate ON gate_intake_lines(mill_id, gate_entry_id, sort_order);
