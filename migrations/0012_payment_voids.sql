-- Keep payment history while allowing authorized correction of an erroneous posting.
ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE payments ADD COLUMN voided_at TEXT;
ALTER TABLE payments ADD COLUMN voided_by TEXT;
