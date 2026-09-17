-- Preserve the quantity/unit the operator entered separately from normalized stock kg.
ALTER TABLE lots ADD COLUMN entered_quantity REAL;
ALTER TABLE lots ADD COLUMN entered_unit TEXT;

UPDATE lots
SET entered_quantity = qty_kg,
    entered_unit = 'KG'
WHERE entered_quantity IS NULL;
