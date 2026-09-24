-- Draft intent only: stock remains available until a processing step is posted.
ALTER TABLE processing_chain_runs ADD COLUMN input_allocations_json TEXT NOT NULL DEFAULT '[]';

-- Abort the entire posting batch if a competing run exhausted a source lot.
CREATE TRIGGER lots_prevent_negative_processing
BEFORE UPDATE OF qty_kg ON lots
WHEN NEW.qty_kg < 0 AND OLD.qty_kg >= 0
BEGIN
  SELECT RAISE(ABORT, 'insufficient quantity in source lot');
END;

CREATE UNIQUE INDEX idx_process_run_chain_step_post
ON process_runs(mill_id, chain_run_step_id)
WHERE chain_run_step_id IS NOT NULL AND status = 'POSTED';
