ALTER TABLE saudas ADD COLUMN buyer_id TEXT REFERENCES buyers(id);
CREATE INDEX idx_saudas_buyer ON saudas(mill_id, buyer_id);
