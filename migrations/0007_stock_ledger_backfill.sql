-- Seed the generic ledger from immutable historical facts. Legacy rows remain intact.
INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, lot_id, quantity, unit, quantity_base, base_unit, source_type, source_id, movement_date, created_at)
SELECT 'legacy-lot-' || l.id, l.mill_id, 'IN', l.item_id, l.godown_id, l.id, l.qty_kg, 'KG', l.qty_kg, 'KG', 'LEGACY_LOT', l.id, l.in_date, l.created_at
FROM lots l
WHERE l.item_id IS NOT NULL;

INSERT INTO stock_movements (id, mill_id, direction, item_id, quantity, unit, quantity_base, base_unit, source_type, source_id, movement_date, created_at)
SELECT 'legacy-gate-' || g.id, g.mill_id, 'OUT', g.item_id, CASE WHEN COALESCE(g.gross_kg, 0) - COALESCE(g.tare_kg, 0) > 0 THEN COALESCE(g.gross_kg, 0) - COALESCE(g.tare_kg, 0) ELSE 0 END, 'KG', CASE WHEN COALESCE(g.gross_kg, 0) - COALESCE(g.tare_kg, 0) > 0 THEN COALESCE(g.gross_kg, 0) - COALESCE(g.tare_kg, 0) ELSE 0 END, 'KG', 'LEGACY_GATE', g.id, g.entry_date, g.created_at
FROM gate_entries g
WHERE g.direction = 'out' AND g.status = 'done' AND g.item_id IS NOT NULL
  AND COALESCE(g.gross_kg, 0) - COALESCE(g.tare_kg, 0) > 0;
