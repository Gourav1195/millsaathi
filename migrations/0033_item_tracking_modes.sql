-- Item tracking modes and dual kg+bag quantities per receipt/lot.

ALTER TABLE items ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'WEIGHT_ONLY'
  CHECK (tracking_mode IN ('WEIGHT_ONLY', 'VARIABLE_BAG', 'FIXED_PACKAGE', 'COUNT_ONLY'));
ALTER TABLE items ADD COLUMN gate_bag_count_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN default_rate_unit TEXT;

ALTER TABLE gate_entries ADD COLUMN observed_bag_count INTEGER;

ALTER TABLE lots ADD COLUMN bag_count INTEGER;
ALTER TABLE lots ADD COLUMN received_bag_count INTEGER;
ALTER TABLE lots ADD COLUMN consumed_bag_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lots ADD COLUMN weight_source TEXT
  CHECK (weight_source IS NULL OR weight_source IN ('WEIGHED', 'DERIVED', 'MANUAL'));

ALTER TABLE gate_intake_lines ADD COLUMN weight_source TEXT
  CHECK (weight_source IS NULL OR weight_source IN ('WEIGHED', 'DERIVED', 'MANUAL'));

ALTER TABLE stock_movements ADD COLUMN bag_count INTEGER;

-- Conservative backfill: retain fixed-package behavior for existing BAG items.
UPDATE items SET tracking_mode = 'FIXED_PACKAGE'
  WHERE package_unit = 'BAG' AND package_quantity_base > 0;

UPDATE items SET tracking_mode = 'COUNT_ONLY'
  WHERE package_unit = 'PIECE' AND package_quantity_base > 0;
