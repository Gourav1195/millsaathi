// Stock lot grouping and processing input consumption with transactional safety.

function itemUsesVariableBags(mode: string | null | undefined): boolean {
  return String(mode ?? '').trim().toUpperCase() === 'VARIABLE_BAG';
}

export type StockLotRow = {
  id: string;
  code: string;
  item_id: string;
  item_name: string;
  qty_kg: number;
  bag_count?: number | null;
  received_bag_count?: number | null;
  consumed_bag_count?: number | null;
  tracking_mode?: string | null;
  received_qty_kg?: number | null;
  consumed_qty_kg?: number | null;
  godown_id?: string | null;
  godown_name?: string | null;
  sauda_id?: string | null;
  sauda_code?: string | null;
  gate_entry_id?: string | null;
  gate_token_no?: string | null;
  supplier_name?: string | null;
  disposition?: string | null;
  allocation_status?: string | null;
};

export type StockGroupAllocation = {
  lot_id: string;
  lot_code: string;
  godown_id: string | null;
  godown_name: string | null;
  available_kg: number;
  received_kg: number;
  consumed_kg: number;
  gate_entry_id?: string | null;
};

export type StockInputGroup = {
  group_key: string;
  item_id: string;
  item_name: string;
  sauda_id: string | null;
  sauda_code: string | null;
  total_available_kg: number;
  allocations: StockGroupAllocation[];
};

export type InputAllocation = {
  lot_id: string;
  quantity_base: number;
};

export type ValidateAllocationsResult =
  | { ok: true; itemId: string; totalBase: number }
  | { ok: false; error: string };

export function stockGroupKey(itemId: string, saudaId: string | null | undefined) {
  return `${itemId}:${saudaId ?? 'unlinked'}`;
}

export function groupStockLots(lots: StockLotRow[]): StockInputGroup[] {
  const groups = new Map<string, StockInputGroup>();
  for (const lot of lots) {
    if (!lot.item_id || lot.qty_kg <= 0) continue;
    const key = stockGroupKey(lot.item_id, lot.sauda_id ?? null);
    const received = Number(lot.received_qty_kg ?? lot.qty_kg) || lot.qty_kg;
    const consumed = Number(lot.consumed_qty_kg ?? 0) || 0;
    const allocation: StockGroupAllocation = {
      lot_id: lot.id,
      lot_code: lot.code,
      godown_id: lot.godown_id ?? null,
      godown_name: lot.godown_name ?? null,
      available_kg: lot.qty_kg,
      received_kg: received,
      consumed_kg: consumed,
      gate_entry_id: lot.gate_entry_id ?? null,
    };
    const existing = groups.get(key);
    if (existing) {
      existing.total_available_kg += lot.qty_kg;
      existing.allocations.push(allocation);
    } else {
      groups.set(key, {
        group_key: key,
        item_id: lot.item_id,
        item_name: lot.item_name,
        sauda_id: lot.sauda_id ?? null,
        sauda_code: lot.sauda_code ?? null,
        total_available_kg: lot.qty_kg,
        allocations: [allocation],
      });
    }
  }
  return [...groups.values()].sort((left, right) => right.total_available_kg - left.total_available_kg);
}

export function validateInputAllocations(params: {
  allocations: InputAllocation[];
  requiredTotalBase: number;
  lotsById: Map<string, StockLotRow>;
  allowedItemIds?: Set<string>;
  permissiveItems?: boolean;
  processName?: string | null;
}): ValidateAllocationsResult {
  const { allocations, requiredTotalBase, lotsById, allowedItemIds, permissiveItems = false, processName } = params;
  if (!permissiveItems && allowedItemIds && allowedItemIds.size === 0) {
    return {
      ok: false,
      error: `${processName ?? 'This process'} has no accepted input items configured. Open All processes and assign input lines before selecting stock.`,
    };
  }
  if (!allocations.length) return { ok: false, error: 'Select at least one stock lot allocation for processing input.' };
  if (!Number.isFinite(requiredTotalBase) || requiredTotalBase <= 0) {
    return { ok: false, error: 'Processing input quantity must be greater than zero.' };
  }

  let totalBase = 0;
  let itemId = '';
  const seen = new Set<string>();

  for (const entry of allocations) {
    const lotId = String(entry.lot_id ?? '').trim();
    const qtyBase = Number(entry.quantity_base);
    if (seen.has(lotId)) return { ok: false, error: 'Each stock lot may only be selected once.' };
    seen.add(lotId);
    if (!lotId) return { ok: false, error: 'Each allocation must reference a stock lot.' };
    if (!Number.isSafeInteger(qtyBase) || qtyBase <= 0) {
      return { ok: false, error: 'Each allocation quantity must be greater than zero.' };
    }
    const lot = lotsById.get(lotId);
    if (!lot) return { ok: false, error: `Stock lot ${lotId} was not found.` };
    if (qtyBase > lot.qty_kg) {
      return { ok: false, error: `${lot.code} only has ${(lot.qty_kg / 100).toFixed(2)} quintal available in ${lot.godown_name ?? 'storage'}.` };
    }
    if (itemUsesVariableBags(lot.tracking_mode)) {
      if (qtyBase !== lot.qty_kg) {
        return {
          ok: false,
          error: 'This item uses variable-weight bags, so processing uses the complete lot. Split and weigh that portion first.',
        };
      }
    }
    if (!permissiveItems && allowedItemIds && allowedItemIds.size > 0 && !allowedItemIds.has(lot.item_id)) {
      return { ok: false, error: `${lot.item_name} is not accepted by this process.` };
    }
    if (itemId && itemId !== lot.item_id) {
      return { ok: false, error: 'All input allocations must use the same material.' };
    }
    itemId = lot.item_id;
    totalBase += qtyBase;
  }

  if (Math.abs(totalBase - Math.round(requiredTotalBase)) > 0.000001) {
    return {
      ok: false,
      error: `Allocated total (${(totalBase / 100).toFixed(3)} qtl) must equal processing input (${(Math.round(requiredTotalBase) / 100).toFixed(3)} qtl).`,
    };
  }

  return { ok: true, itemId, totalBase };
}

export async function loadProcessingStockLots(
  db: D1Database,
  millId: string,
  options?: { itemId?: string; godownId?: string },
): Promise<StockLotRow[]> {
  let query = `
    SELECT l.id, l.code, l.item_id, l.qty_kg, l.bag_count, l.received_bag_count, l.consumed_bag_count,
           l.received_qty_kg, l.consumed_qty_kg,
           l.godown_id, l.sauda_id, l.gate_entry_id, l.disposition, l.allocation_status,
           i.name AS item_name, i.tracking_mode, g.name AS godown_name, sa.code AS sauda_code,
           ge.token_no AS gate_token_no,
           COALESCE(sup_sa.name, sup_ge.name) AS supplier_name
    FROM lots l
    LEFT JOIN items i ON i.id = l.item_id
    LEFT JOIN godowns g ON g.id = l.godown_id
    LEFT JOIN saudas sa ON sa.id = l.sauda_id
    LEFT JOIN gate_entries ge ON ge.id = l.gate_entry_id AND ge.mill_id = l.mill_id
    LEFT JOIN suppliers sup_sa ON sup_sa.id = sa.supplier_id
    LEFT JOIN suppliers sup_ge ON sup_ge.id = ge.supplier_id
    WHERE l.mill_id = ? AND l.qty_kg > 0
      AND COALESCE(l.disposition, 'STOCK') IN ('STOCK', 'FOR_REUSE')
  `;
  const params: unknown[] = [millId];
  if (options?.itemId) {
    query += ` AND l.item_id = ?`;
    params.push(options.itemId);
  }
  if (options?.godownId) {
    query += ` AND l.godown_id = ?`;
    params.push(options.godownId);
  }
  query += ` ORDER BY l.in_date DESC, l.code DESC LIMIT 2000`;
  const rows = await db.prepare(query).bind(...params).all<StockLotRow>();
  return rows.results;
}

export async function consumeStockLotsForProcessing(
  db: D1Database,
  millId: string,
  params: {
    allocations: InputAllocation[];
    processRunId: string;
    chainRunId?: string | null;
    chainRunStepId?: string | null;
    idempotencyKey?: string | null;
    uuid: () => string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { allocations, processRunId, chainRunId, chainRunStepId, idempotencyKey, uuid } = params;

  if (idempotencyKey) {
    const existing = await db.prepare(
      `SELECT id FROM processing_input_consumptions WHERE mill_id = ? AND idempotency_key = ? LIMIT 1`,
    ).bind(millId, idempotencyKey).first();
    if (existing) return { ok: true };
  }

  const statements: D1PreparedStatement[] = [];

  for (const entry of allocations) {
    const lotId = String(entry.lot_id);
    const qtyBase = Math.round(Number(entry.quantity_base));
    const lot = await db.prepare(
      `SELECT l.id, l.item_id, l.qty_kg, l.godown_id, l.sauda_id, l.gate_entry_id, l.consumed_qty_kg, l.received_qty_kg
       FROM lots l WHERE l.id = ? AND l.mill_id = ?`,
    ).bind(lotId, millId).first<{
      id: string;
      item_id: string;
      qty_kg: number;
      godown_id: string | null;
      sauda_id: string | null;
      gate_entry_id: string | null;
      consumed_qty_kg: number | null;
      received_qty_kg: number | null;
    }>();
    if (!lot || lot.qty_kg < qtyBase) {
      return { ok: false, error: `Insufficient available quantity in lot ${lotId}.` };
    }

    const nextConsumed = (Number(lot.consumed_qty_kg) || 0) + qtyBase;
    const nextAvailable = lot.qty_kg - qtyBase;
    const nextStatus = nextAvailable <= 0 ? 'consumed' : 'partially_available';

    statements.push(
      db.prepare(
        `UPDATE lots SET qty_kg = qty_kg - ?, consumed_qty_kg = ?, allocation_status = ?
         WHERE id = ? AND mill_id = ? AND qty_kg >= ?`,
      ).bind(qtyBase, nextConsumed, nextStatus, lotId, millId, qtyBase),
    );
    statements.push(
      db.prepare(
        `INSERT INTO processing_input_consumptions
         (id, mill_id, chain_run_id, chain_run_step_id, process_run_id, lot_id, sauda_id, gate_entry_id, item_id, godown_id, quantity_base, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        uuid(), millId, chainRunId ?? null, chainRunStepId ?? null, processRunId,
        lotId, lot.sauda_id, lot.gate_entry_id, lot.item_id, lot.godown_id, qtyBase,
        idempotencyKey ? `${idempotencyKey}:${lotId}` : null,
      ),
    );
  }

  await db.batch(statements);
  return { ok: true };
}

export async function gateAllocatedKg(db: D1Database, millId: string, gateEntryId: string) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(received_qty_kg), 0) AS allocated FROM lots WHERE mill_id = ? AND gate_entry_id = ?`,
  ).bind(millId, gateEntryId).first<{ allocated: number }>();
  return row?.allocated ?? 0;
}

export async function gateNetKg(db: D1Database, millId: string, gateEntryId: string) {
  const row = await db.prepare(
    `SELECT MAX(COALESCE(gross_kg,0) - COALESCE(tare_kg,0), 0) AS net_kg FROM gate_entries WHERE id = ? AND mill_id = ?`,
  ).bind(gateEntryId, millId).first<{ net_kg: number }>();
  return Math.max(0, Math.round(row?.net_kg ?? 0));
}

export async function syncGateStockStatus(db: D1Database, millId: string, gateEntryId: string) {
  const net = await gateNetKg(db, millId, gateEntryId);
  const allocated = await gateAllocatedKg(db, millId, gateEntryId);
  const status = allocated <= 0 ? 'pending' : allocated >= net ? 'added' : 'partial';
  await db.prepare(
    `UPDATE gate_entries SET stock_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND mill_id = ?`,
  ).bind(status, gateEntryId, millId).run();
}

export async function undoGateLotAccept(
  db: D1Database,
  millId: string,
  lotId: string,
  userId: string,
): Promise<{ ok: true; gate_entry_id: string; code: string } | { ok: false; error: string }> {
  const lot = await db.prepare(
    `SELECT id, code, gate_entry_id, consumed_qty_kg, qty_kg
     FROM lots WHERE id = ? AND mill_id = ?`,
  ).bind(lotId, millId).first<{
    id: string;
    code: string;
    gate_entry_id: string | null;
    consumed_qty_kg: number;
    qty_kg: number;
  }>();
  if (!lot) return { ok: false, error: 'lot not found' };
  if (!lot.gate_entry_id) return { ok: false, error: 'this lot was not created from a truck acceptance' };
  if ((lot.consumed_qty_kg ?? 0) > 0 || lot.qty_kg <= 0) {
    return { ok: false, error: 'this lot has already been used and cannot be undone' };
  }
  const settlementLine = await db.prepare(
    `SELECT id FROM gate_intake_lines WHERE mill_id = ? AND lot_id = ? LIMIT 1`,
  ).bind(millId, lotId).first();
  if (settlementLine) return { ok: false, error: 'only one-click truck accepts can be undone here' };
  const consumed = await db.prepare(
    `SELECT id FROM processing_input_consumptions WHERE mill_id = ? AND lot_id = ? LIMIT 1`,
  ).bind(millId, lotId).first();
  if (consumed) return { ok: false, error: 'this lot has already been used and cannot be undone' };

  const gateEntryId = lot.gate_entry_id;
  await db.batch([
    db.prepare(
      `UPDATE stock_movements
       SET status = 'VOID',
           voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           voided_by = ?,
           lot_id = NULL
       WHERE mill_id = ? AND status = 'POSTED' AND (lot_id = ? OR (source_type = 'LOT' AND source_id = ?))`,
    ).bind(userId, millId, lotId, lotId),
    db.prepare(
      `UPDATE sauda_deliveries SET lot_id = NULL, godown_id = NULL WHERE mill_id = ? AND lot_id = ?`,
    ).bind(millId, lotId),
    db.prepare(`DELETE FROM lots WHERE id = ? AND mill_id = ?`).bind(lotId, millId),
  ]);
  await syncGateStockStatus(db, millId, gateEntryId);
  return { ok: true, gate_entry_id: gateEntryId, code: lot.code };
}
