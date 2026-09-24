-- A retry of one whole-chain submission must never post inventory twice.
ALTER TABLE processing_chain_runs ADD COLUMN completion_key TEXT;
CREATE UNIQUE INDEX idx_chain_completion_key ON processing_chain_runs(mill_id, completion_key)
WHERE completion_key IS NOT NULL;
