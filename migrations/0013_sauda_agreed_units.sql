-- Preserve the contracted quantity/unit separately from normalized agreement kilograms.
ALTER TABLE saudas ADD COLUMN agreed_quantity REAL;
ALTER TABLE saudas ADD COLUMN agreed_unit TEXT;

UPDATE saudas
SET agreed_quantity = qty_kg / 100.0,
    agreed_unit = 'QUINTAL'
WHERE agreed_quantity IS NULL;
