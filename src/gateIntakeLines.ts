export type GateIntakeLineInsert = {
  millId: string;
  gateEntryId: string;
  lotId: string | null;
  userId: string;
  sortOrder: number;
  outcome: 'REJECTED' | 'ACCEPTED';
  qtyKg: number;
  bagCount: number | null;
  ratePaisePerQtl: number | null;
  ratePaisePerBag: number | null;
  rateUnit: 'BAG' | 'QTL';
  reason: string | null;
  weightSource: 'WEIGHED' | 'DERIVED' | 'MANUAL';
};

export function gateIntakeLineInsertStatement(
  db: D1Database,
  lineId: string,
  line: GateIntakeLineInsert,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO gate_intake_lines
     (id, mill_id, gate_entry_id, sort_order, outcome, bag_count, qty_kg, rate_paise_per_qtl, rate_paise_per_bag, rate_unit, reason, lot_id, created_by, weight_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    lineId,
    line.millId,
    line.gateEntryId,
    line.sortOrder,
    line.outcome,
    line.bagCount,
    line.qtyKg,
    line.ratePaisePerQtl,
    line.ratePaisePerBag,
    line.rateUnit,
    line.reason,
    line.lotId,
    line.userId,
    line.weightSource,
  );
}

export async function nextGateIntakeSortOrder(db: D1Database, millId: string, gateEntryId: string) {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_order
     FROM gate_intake_lines WHERE mill_id = ? AND gate_entry_id = ?`,
  ).bind(millId, gateEntryId).first<{ max_order: number }>();
  return (row?.max_order ?? -1) + 1;
}

export async function gateIntakeLineCount(db: D1Database, millId: string, gateEntryId: string) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count FROM gate_intake_lines WHERE mill_id = ? AND gate_entry_id = ?`,
  ).bind(millId, gateEntryId).first<{ count: number }>();
  return row?.count ?? 0;
}
