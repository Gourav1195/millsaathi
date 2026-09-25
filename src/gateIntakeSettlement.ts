import {
  allocateProportionalKg,
  calculateCommercialValue,
  itemUsesVariableBags,
  normalizeWeightQuantity,
} from '../shared/quantity';
import { gateAllocatedKg, gateNetKg, syncGateStockStatus } from './stockLotProcessing';

export type SettlementLineInput = {
  outcome: 'REJECTED' | 'ACCEPTED';
  bags?: number;
  quantity?: number;
  unit?: string;
  rate_inr?: number;
  rate_unit?: 'BAG' | 'QTL';
  reason?: string;
};

type ItemPackage = {
  tracking_mode: string | null;
  package_unit: string | null;
  package_quantity_base: number | null;
};

type GateRow = {
  id: string;
  item_id: string | null;
  quality_json: string | null;
  sauda_id: string | null;
  moisture_pct: number | null;
  stock_status: string;
  observed_bag_count: number | null;
};

function lineQtyKg(
  line: SettlementLineInput,
  item: ItemPackage | null,
  useVariableBags: boolean,
  useFixedBags: boolean,
  remainingKg: number,
  remainingBags: number,
  lineIndex: number,
  allLineBags: number[],
): { qtyKg: number; bagCount: number | null; weightSource: 'WEIGHED' | 'DERIVED' | 'MANUAL'; error?: string } {
  if (useVariableBags) {
    const bags = Number(line.bags);
    if (!Number.isInteger(bags) || bags <= 0) return { qtyKg: 0, bagCount: null, weightSource: 'DERIVED', error: 'each line needs a positive whole bag count' };
    try {
      const allocations = allocateProportionalKg(remainingKg, allLineBags, remainingBags);
      return { qtyKg: allocations[lineIndex], bagCount: bags, weightSource: 'DERIVED' };
    } catch (error) {
      return { qtyKg: 0, bagCount: null, weightSource: 'DERIVED', error: error instanceof Error ? error.message : 'invalid bag allocation' };
    }
  }
  if (useFixedBags) {
    const bags = Number(line.bags);
    if (!Number.isInteger(bags) || bags <= 0) return { qtyKg: 0, bagCount: null, weightSource: 'DERIVED', error: 'each line needs a positive whole bag count' };
    const kgPerBag = Number(item?.package_quantity_base);
    if (!Number.isFinite(kgPerBag) || kgPerBag <= 0) return { qtyKg: 0, bagCount: null, weightSource: 'DERIVED', error: 'item bag weight is not configured' };
    return { qtyKg: Math.round(bags * kgPerBag), bagCount: bags, weightSource: 'DERIVED' };
  }
  const unit = String(line.unit ?? 'QUINTAL').trim().toUpperCase();
  const quantity = Number(line.quantity);
  const normalized = normalizeWeightQuantity(quantity, unit);
  if (!normalized || normalized.base <= 0) return { qtyKg: 0, bagCount: null, weightSource: 'DERIVED', error: 'each line needs a positive quantity' };
  return { qtyKg: normalized.base, bagCount: null, weightSource: 'DERIVED' };
}

function lineValuePaise(
  line: SettlementLineInput,
  qtyKg: number,
  bagCount: number | null,
  defaultRatePaisePerQtl: number,
): { valuePaise: number; ratePaisePerQtl: number | null; ratePaisePerBag: number | null; rateUnit: 'BAG' | 'QTL'; error?: string } {
  if (line.outcome === 'REJECTED') {
    return { valuePaise: 0, ratePaisePerQtl: null, ratePaisePerBag: null, rateUnit: bagCount != null ? 'BAG' : 'QTL' };
  }
  const rateInr = line.rate_inr == null ? defaultRatePaisePerQtl / 100 : Number(line.rate_inr);
  if (!Number.isFinite(rateInr) || rateInr < 0) return { valuePaise: 0, ratePaisePerQtl: null, ratePaisePerBag: null, rateUnit: 'BAG', error: 'accepted lines need a non-negative rate' };
  const rateUnit = line.rate_unit === 'QTL' || bagCount == null ? 'QTL' : 'BAG';
  const valuePaise = calculateCommercialValue({
    qtyKg,
    bagCount,
    rateInr,
    rateUnit,
  });
  if (rateUnit === 'BAG') {
    const ratePaisePerBag = Math.round(rateInr * 100);
    return { valuePaise, ratePaisePerQtl: null, ratePaisePerBag, rateUnit };
  }
  const ratePaisePerQtl = Math.round(rateInr * 100);
  return { valuePaise, ratePaisePerQtl, ratePaisePerBag: null, rateUnit };
}

async function disposedQtyKg(db: D1Database, millId: string, gateEntryId: string) {
  const lots = await gateAllocatedKg(db, millId, gateEntryId);
  const rejected = await db.prepare(
    `SELECT COALESCE(SUM(qty_kg), 0) AS qty
     FROM gate_intake_lines
     WHERE mill_id = ? AND gate_entry_id = ? AND outcome = 'REJECTED'`,
  ).bind(millId, gateEntryId).first<{ qty: number }>();
  return lots + (rejected?.qty ?? 0);
}

async function gateAllocatedBags(db: D1Database, millId: string, gateEntryId: string) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(received_bag_count), 0) AS allocated
     FROM lots WHERE mill_id = ? AND gate_entry_id = ?`,
  ).bind(millId, gateEntryId).first<{ allocated: number }>();
  return row?.allocated ?? 0;
}

async function gateRejectedBags(db: D1Database, millId: string, gateEntryId: string) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(bag_count), 0) AS bags
     FROM gate_intake_lines
     WHERE mill_id = ? AND gate_entry_id = ? AND outcome = 'REJECTED'`,
  ).bind(millId, gateEntryId).first<{ bags: number }>();
  return row?.bags ?? 0;
}

async function finalizeGateIntakeStatus(db: D1Database, millId: string, gateEntryId: string, stockNote: string | null) {
  const net = await gateNetKg(db, millId, gateEntryId);
  const allocated = await gateAllocatedKg(db, millId, gateEntryId);
  const disposed = await disposedQtyKg(db, millId, gateEntryId);
  const rejected = Math.max(0, disposed - allocated);
  let status = 'pending';
  if (allocated <= 0 && rejected >= net && net > 0) status = 'skipped';
  else if (disposed >= net && net > 0) status = 'added';
  else if (allocated > 0) status = 'partial';
  await db.prepare(
    `UPDATE gate_entries
     SET stock_status = ?, stock_note = COALESCE(?, stock_note), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND mill_id = ?`,
  ).bind(status, stockNote, gateEntryId, millId).run();
}

export async function settleGateIntake(params: {
  db: D1Database;
  millId: string;
  userId: string;
  gateEntryId: string;
  godownId: string;
  lines: SettlementLineInput[];
  uuid: () => string;
  nextCode: (db: D1Database, millId: string, key: string, prefix: string) => Promise<string>;
  istToday: () => string;
  defaultRatePaisePerQtl: number;
}): Promise<{ ok: true; lot_codes: string[] } | { ok: false; error: string }> {
  const { db, millId, userId, gateEntryId, godownId, lines, uuid, nextCode, istToday, defaultRatePaisePerQtl } = params;
  if (!lines.length) return { ok: false, error: 'add at least one settlement line' };

  const gate = await db.prepare(
    `SELECT id, item_id, quality_json, sauda_id, moisture_pct, stock_status, observed_bag_count
     FROM gate_entries
     WHERE id = ? AND mill_id = ? AND direction = 'in' AND status = 'done'
       AND stock_status IN ('pending', 'partial')`,
  ).bind(gateEntryId, millId).first<GateRow>();
  if (!gate) return { ok: false, error: 'incoming truck is not pending for stock settlement' };
  if (!gate.item_id) return { ok: false, error: 'truck item is required before settlement' };

  const godown = await db.prepare(`SELECT id FROM godowns WHERE id = ? AND mill_id = ? AND active = 1`).bind(godownId, millId).first();
  if (!godown) return { ok: false, error: 'godown not found' };

  const item = await db.prepare(
    `SELECT tracking_mode, package_unit, package_quantity_base FROM items WHERE id = ? AND mill_id = ? AND deleted_at IS NULL`,
  ).bind(gate.item_id, millId).first<ItemPackage>();
  const useVariableBags = itemUsesVariableBags(item?.tracking_mode);
  const useFixedBags = !useVariableBags
    && String(item?.package_unit ?? '').toUpperCase() === 'BAG'
    && Number(item?.package_quantity_base) > 0;

  const net = await gateNetKg(db, millId, gateEntryId);
  const alreadyAllocated = await gateAllocatedKg(db, millId, gateEntryId);
  const remainingKg = Math.max(0, net - alreadyAllocated);
  const totalBags = gate.observed_bag_count;
  const alreadyAllocatedBags = await gateAllocatedBags(db, millId, gateEntryId);
  const rejectedBagsSoFar = await gateRejectedBags(db, millId, gateEntryId);
  const remainingBags = totalBags != null
    ? Math.max(0, totalBags - alreadyAllocatedBags - rejectedBagsSoFar)
    : null;

  const [lotColumnsRes] = await db.batch([db.prepare(`PRAGMA table_info(lots)`)]);
  const lotColumns = new Set((lotColumnsRes.results as { name: string }[]).map((col) => col.name));

  const lineBagDrafts = lines.map((line) => Number(line.bags));
  if (useVariableBags) {
    if (remainingBags == null) return { ok: false, error: 'truck bag count is required before settlement' };
    const bagSum = lineBagDrafts.reduce((sum, bags) => sum + (Number.isFinite(bags) ? bags : 0), 0);
    if (bagSum !== remainingBags) {
      return { ok: false, error: `settlement must account for all ${remainingBags} remaining bag${remainingBags === 1 ? '' : 's'}` };
    }
  }

  let settlementKg = 0;
  const preparedLines: Array<{
    outcome: 'REJECTED' | 'ACCEPTED';
    bagCount: number | null;
    qtyKg: number;
    valuePaise: number;
    ratePaisePerQtl: number | null;
    ratePaisePerBag: number | null;
    rateUnit: 'BAG' | 'QTL';
    reason: string | null;
    lotId: string | null;
    enteredQuantity: number | null;
    enteredUnit: string | null;
    weightSource: 'WEIGHED' | 'DERIVED' | 'MANUAL';
  }> = [];

  for (const [index, line] of lines.entries()) {
    const outcome = line.outcome === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';
    const qty = lineQtyKg(
      line,
      item,
      useVariableBags,
      useFixedBags,
      remainingKg,
      remainingBags ?? 0,
      index,
      lineBagDrafts,
    );
    if (qty.error) return { ok: false, error: qty.error };
    const value = lineValuePaise(line, qty.qtyKg, qty.bagCount, defaultRatePaisePerQtl);
    if (value.error) return { ok: false, error: value.error };
    settlementKg += qty.qtyKg;
    preparedLines.push({
      outcome,
      bagCount: qty.bagCount,
      qtyKg: qty.qtyKg,
      valuePaise: value.valuePaise,
      ratePaisePerQtl: value.ratePaisePerQtl,
      ratePaisePerBag: value.ratePaisePerBag,
      rateUnit: value.rateUnit,
      reason: line.reason ? String(line.reason).trim().slice(0, 240) : null,
      lotId: null,
      enteredQuantity: useVariableBags || useFixedBags ? qty.bagCount : Number(line.quantity ?? qty.qtyKg / 100),
      enteredUnit: useVariableBags || useFixedBags ? 'BAG' : String(line.unit ?? 'QUINTAL').trim().toUpperCase(),
      weightSource: qty.weightSource,
    });
  }

  if (useVariableBags) {
    if (settlementKg !== remainingKg) {
      return { ok: false, error: `settlement must account for all remaining weight (${(remainingKg / 100).toFixed(2)} qtl left)` };
    }
  } else if (Math.abs(settlementKg - remainingKg) > 1) {
    return { ok: false, error: `settlement must account for all remaining quantity (${(remainingKg / 100).toFixed(2)} qtl left)` };
  }

  const statements: D1PreparedStatement[] = [];
  const lotCodes: string[] = [];
  let acceptedBags = 0;
  let rejectedBags = 0;

  for (const [index, line] of preparedLines.entries()) {
    let lotId: string | null = null;
    if (line.outcome === 'ACCEPTED') {
      lotId = uuid();
      const lotCode = await nextCode(db, millId, 'lot', 'LOT');
      lotCodes.push(lotCode);
      acceptedBags += line.bagCount ?? 0;
      const columns = ['id', 'mill_id', 'code', 'godown_id', 'item_id', 'qty_kg', 'moisture_pct', 'value_paise', 'in_date', 'quality_json'];
      const values: unknown[] = [
        lotId, millId, lotCode, godownId, gate.item_id, line.qtyKg, gate.moisture_pct,
        line.valuePaise, istToday(), gate.quality_json,
      ];
      if (lotColumns.has('gate_entry_id')) {
        columns.splice(3, 0, 'gate_entry_id');
        values.splice(3, 0, gateEntryId);
      }
      if (lotColumns.has('sauda_id')) {
        columns.push('sauda_id');
        values.push(gate.sauda_id);
      }
      if (lotColumns.has('received_qty_kg')) {
        columns.push('received_qty_kg');
        values.push(line.qtyKg);
      }
      if (lotColumns.has('consumed_qty_kg')) {
        columns.push('consumed_qty_kg');
        values.push(0);
      }
      if (lotColumns.has('allocation_status')) {
        columns.push('allocation_status');
        values.push('partially_available');
      }
      if (lotColumns.has('entered_quantity')) {
        columns.push('entered_quantity');
        values.push(line.enteredQuantity);
      }
      if (lotColumns.has('entered_unit')) {
        columns.push('entered_unit');
        values.push(line.enteredUnit);
      }
      if (lotColumns.has('bag_count') && line.bagCount != null) {
        columns.push('bag_count', 'received_bag_count');
        values.push(line.bagCount, line.bagCount);
      }
      if (lotColumns.has('weight_source')) {
        columns.push('weight_source');
        values.push(line.weightSource);
      }
      if (lotColumns.has('note')) {
        columns.push('note');
        values.push(line.reason);
      }
      statements.push(db.prepare(
        `INSERT INTO lots (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      ).bind(...values));
      statements.push(db.prepare(
        `INSERT INTO stock_movements (id, mill_id, direction, item_id, godown_id, lot_id, quantity, unit, quantity_base, base_unit, source_type, source_id, movement_date, created_by, bag_count)
         VALUES (?, ?, 'IN', ?, ?, ?, ?, ?, ?, 'KG', 'LOT', ?, ?, ?, ?)`,
      ).bind(
        uuid(), millId, gate.item_id, godownId, lotId,
        line.enteredQuantity ?? line.qtyKg, line.enteredUnit ?? 'KG', line.qtyKg,
        lotId, istToday(), userId, line.bagCount,
      ));
      statements.push(db.prepare(
        `UPDATE sauda_deliveries SET lot_id = COALESCE(lot_id, ?), godown_id = COALESCE(godown_id, ?)
         WHERE mill_id = ? AND gate_entry_id = ? AND lot_id IS NULL`,
      ).bind(lotId, godownId, millId, gateEntryId));
    } else {
      rejectedBags += line.bagCount ?? 0;
    }

    statements.push(db.prepare(
      `INSERT INTO gate_intake_lines
       (id, mill_id, gate_entry_id, sort_order, outcome, bag_count, qty_kg, rate_paise_per_qtl, rate_paise_per_bag, rate_unit, reason, lot_id, created_by, weight_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), millId, gateEntryId, index, line.outcome, line.bagCount, line.qtyKg,
      line.ratePaisePerQtl, line.ratePaisePerBag, line.rateUnit, line.reason, lotId, userId, line.weightSource,
    ));
  }

  const stockNote = useVariableBags || useFixedBags
    ? `Settled intake: ${acceptedBags} bag${acceptedBags === 1 ? '' : 's'} accepted, ${rejectedBags} bag${rejectedBags === 1 ? '' : 's'} rejected`
    : `Settled intake: ${(settlementKg / 100).toFixed(2)} qtl split across ${preparedLines.length} line${preparedLines.length === 1 ? '' : 's'}`;

  await db.batch(statements);
  await finalizeGateIntakeStatus(db, millId, gateEntryId, stockNote);
  await syncGateStockStatus(db, millId, gateEntryId);
  return { ok: true, lot_codes: lotCodes };
}
