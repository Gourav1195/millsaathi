ALTER TABLE gate_entries ADD COLUMN stock_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE gate_entries ADD COLUMN stock_note TEXT;
UPDATE gate_entries
SET stock_status = 'skipped', stock_note = 'Created before stock receipt helper existed'
WHERE direction = 'in' AND status = 'done';

ALTER TABLE lots ADD COLUMN gate_entry_id TEXT REFERENCES gate_entries(id);
ALTER TABLE lots ADD COLUMN note TEXT;
CREATE UNIQUE INDEX idx_lots_gate_entry ON lots(gate_entry_id) WHERE gate_entry_id IS NOT NULL;

CREATE TABLE feedback_tickets (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'help' CHECK (kind IN ('help','bug','feature')),
  page TEXT,
  message TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_feedback_mill ON feedback_tickets(mill_id, created_at);

INSERT INTO items (id, mill_id, name, category, hsn, typical_otr_pct)
SELECT lower(hex(randomblob(16))), m.id, 'Parboiled Non-Basmati Rice', 'rice', '1006', 68
FROM mills m
WHERE NOT EXISTS (
  SELECT 1 FROM items i
  WHERE i.mill_id = m.id AND lower(i.name) = lower('Parboiled Non-Basmati Rice')
);
