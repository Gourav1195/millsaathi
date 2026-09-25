-- Store the contracted deal total explicitly; rate_paise_per_qtl remains a derived per-unit field.
ALTER TABLE saudas ADD COLUMN agreed_value_paise INTEGER NOT NULL DEFAULT 0;

UPDATE saudas
SET agreed_value_paise = CASE
  WHEN UPPER(COALESCE(agreed_unit, 'QUINTAL')) IN ('BAG', 'PIECE')
    THEN CAST(ROUND(COALESCE(agreed_quantity, 0) * rate_paise_per_qtl) AS INTEGER)
  WHEN UPPER(COALESCE(agreed_unit, 'QUINTAL')) = 'KG'
    THEN CAST(ROUND(qty_kg * rate_paise_per_qtl) AS INTEGER)
  ELSE CAST(ROUND(qty_kg * rate_paise_per_qtl / 100.0) AS INTEGER)
END
WHERE agreed_value_paise = 0 AND rate_paise_per_qtl > 0;
