-- Stock lots as processing input source of truth: traceability + multi-godown allocations.

-- Allow multiple godown lots from one truck receipt.
DROP INDEX IF EXISTS idx_lots_gate_entry;

ALTER TABLE lots ADD COLUMN sauda_id TEXT REFERENCES saudas(id);
ALTER TABLE lots ADD COLUMN received_qty_kg INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lots ADD COLUMN consumed_qty_kg INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lots ADD COLUMN allocation_status TEXT NOT NULL DEFAULT 'available';

CREATE INDEX idx_lots_gate_entry ON lots(mill_id, gate_entry_id) WHERE gate_entry_id IS NOT NULL;
CREATE INDEX idx_lots_sauda_item ON lots(mill_id, sauda_id, item_id);

-- Backfill received quantity and sauda linkage from existing rows (non-destructive).
UPDATE lots
SET received_qty_kg = qty_kg,
    consumed_qty_kg = 0,
    allocation_status = CASE WHEN qty_kg > 0 THEN 'partially_available' ELSE 'consumed' END
WHERE received_qty_kg = 0;

UPDATE lots
SET sauda_id = (
  SELECT g.sauda_id FROM gate_entries g
  WHERE g.id = lots.gate_entry_id AND g.mill_id = lots.mill_id
)
WHERE gate_entry_id IS NOT NULL AND sauda_id IS NULL;

-- Immutable consumption audit trail from processing back to stock lots.
CREATE TABLE processing_input_consumptions (
  id TEXT PRIMARY KEY,
  mill_id TEXT NOT NULL REFERENCES mills(id),
  chain_run_id TEXT REFERENCES processing_chain_runs(id),
  chain_run_step_id TEXT REFERENCES processing_chain_run_steps(id),
  process_run_id TEXT NOT NULL REFERENCES process_runs(id),
  lot_id TEXT NOT NULL REFERENCES lots(id),
  sauda_id TEXT REFERENCES saudas(id),
  gate_entry_id TEXT REFERENCES gate_entries(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  godown_id TEXT REFERENCES godowns(id),
  quantity_base REAL NOT NULL CHECK (quantity_base > 0),
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_proc_input_cons_run ON processing_input_consumptions(mill_id, chain_run_id);
CREATE INDEX idx_proc_input_cons_lot ON processing_input_consumptions(mill_id, lot_id);
CREATE UNIQUE INDEX idx_proc_input_cons_idempotency ON processing_input_consumptions(mill_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
