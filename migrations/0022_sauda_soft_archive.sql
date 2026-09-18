-- Saudas are financially linked records. Archive them instead of ever deleting
-- them so historical gate, delivery, payment and document references remain intact.
ALTER TABLE saudas ADD COLUMN deleted_at TEXT;
ALTER TABLE saudas ADD COLUMN deleted_by TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_saudas_active ON saudas(mill_id, deleted_at);
