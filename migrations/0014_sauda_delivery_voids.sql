ALTER TABLE sauda_deliveries ADD COLUMN status TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE sauda_deliveries ADD COLUMN voided_at TEXT;
ALTER TABLE sauda_deliveries ADD COLUMN voided_by TEXT;

CREATE INDEX IF NOT EXISTS idx_sauda_deliveries_status
  ON sauda_deliveries(mill_id, sauda_id, status);
