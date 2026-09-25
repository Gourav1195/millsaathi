import { formatQtl, formatRupee } from './format';
import type { DetailRow } from './row-details';

export type GateIntakeLineRef = {
  id: string;
  gate_entry_id: string;
  lot_id?: string | null;
  sort_order?: number;
  outcome?: 'REJECTED' | 'ACCEPTED';
  bag_count?: number | null;
  qty_kg?: number;
  rate_paise_per_qtl?: number | null;
  rate_paise_per_bag?: number | null;
  rate_unit?: 'BAG' | 'QTL' | string;
  reason?: string | null;
};

export type LotValueContext = {
  id: string;
  gate_entry_id?: string | null;
  sauda_id?: string | null;
  gate_token_no?: string | null;
  qty_kg?: number;
  value_paise?: number | null;
  sauda_code?: string | null;
};

function formatRate(line: GateIntakeLineRef) {
  if (line.rate_unit === 'BAG' && line.rate_paise_per_bag != null) {
    return `${formatRupee(line.rate_paise_per_bag)}/bag`;
  }
  if (line.rate_paise_per_qtl != null) {
    return `${formatRupee(line.rate_paise_per_qtl)}/qtl`;
  }
  return 'rate not recorded';
}

function lineValuePaise(line: GateIntakeLineRef) {
  if (line.outcome === 'REJECTED') return 0;
  if (line.rate_unit === 'BAG' && line.rate_paise_per_bag != null && line.bag_count != null) {
    return Math.round(line.bag_count * line.rate_paise_per_bag);
  }
  if (line.rate_paise_per_qtl != null) {
    return Math.round((line.qty_kg ?? 0) * (line.rate_paise_per_qtl / 100));
  }
  return null;
}

function formatIntakeLineRow(line: GateIntakeLineRef, lotId: string): DetailRow {
  const qtyLabel = line.bag_count != null && line.bag_count > 0
    ? `${line.bag_count} bag${line.bag_count === 1 ? '' : 's'}`
    : formatQtl(line.qty_kg);
  const thisLot = line.lot_id === lotId ? ' · this lot' : '';
  if (line.outcome === 'REJECTED') {
    const reason = line.reason?.trim();
    return {
      label: 'Rejected',
      value: `${qtyLabel} rejected/returned · not stocked${reason ? ` · ${reason}` : ''}`,
    };
  }
  const value = lineValuePaise(line);
  return {
    label: 'Accepted',
    value: `${qtyLabel} at ${formatRate(line)}${value != null ? ` · ${formatRupee(value)}` : ''}${thisLot}`,
  };
}

function syntheticFullAcceptRow(lot: LotValueContext): DetailRow {
  const qty = formatQtl(lot.qty_kg);
  const value = formatRupee(lot.value_paise);
  const truck = lot.gate_token_no ? ` · truck ${lot.gate_token_no}` : '';
  if ((lot.value_paise ?? 0) <= 0) {
    return {
      label: 'Full accept',
      value: `${qty} accepted${truck} · agreed rate not set on sauda/truck — value is ${value}`,
    };
  }
  const impliedRate = lot.qty_kg && lot.qty_kg > 0
    ? formatRupee(Math.round(((lot.value_paise ?? 0) / lot.qty_kg) * 100))
    : null;
  return {
    label: 'Full accept',
    value: `${qty} accepted${truck}${impliedRate ? ` · ${impliedRate}/qtl` : ''} · ${value}`,
  };
}

function manualSaudaRows(lot: LotValueContext): DetailRow[] {
  const sauda = lot.sauda_code ? ` · ${lot.sauda_code}` : '';
  const qty = formatQtl(lot.qty_kg);
  const value = formatRupee(lot.value_paise);
  if ((lot.value_paise ?? 0) <= 0) {
    return [{
      label: 'Manual receipt',
      value: `${qty} from sauda${sauda} · rate not set — value is ${value}`,
    }];
  }
  const impliedRate = lot.qty_kg && lot.qty_kg > 0
    ? formatRupee(Math.round(((lot.value_paise ?? 0) / lot.qty_kg) * 100))
    : null;
  return [{
    label: 'Manual receipt',
    value: `${qty} pro-rated from sauda deal${sauda}${impliedRate ? ` · ${impliedRate}/qtl` : ''} · ${value}`,
  }];
}

export function intakeLinesByGate(lines: GateIntakeLineRef[]) {
  const map = new Map<string, GateIntakeLineRef[]>();
  for (const line of lines) {
    if (!line.gate_entry_id) continue;
    map.set(line.gate_entry_id, [...(map.get(line.gate_entry_id) ?? []), line]);
  }
  for (const [gateId, gateLines] of map) {
    map.set(gateId, gateLines.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
  }
  return map;
}

export function lotValueBreakdownRows(
  lot: LotValueContext,
  intakeByGate: Map<string, GateIntakeLineRef[]>,
): DetailRow[] {
  if (lot.gate_entry_id) {
    const lines = intakeByGate.get(lot.gate_entry_id) ?? [];
    if (lines.length) {
      return lines.map((line) => formatIntakeLineRow(line, lot.id));
    }
    return [syntheticFullAcceptRow(lot)];
  }
  if (lot.sauda_id) return manualSaudaRows(lot);
  if ((lot.value_paise ?? 0) > 0) {
    return [{
      label: 'Manual stock',
      value: `${formatQtl(lot.qty_kg)} · ${formatRupee(lot.value_paise)} entered manually`,
    }];
  }
  return [];
}

export function lotValueHasBreakdown(lot: LotValueContext, intakeByGate: Map<string, GateIntakeLineRef[]>) {
  if (lot.gate_entry_id || lot.sauda_id) return true;
  return (intakeByGate.get(lot.gate_entry_id ?? '') ?? []).length > 0;
}
