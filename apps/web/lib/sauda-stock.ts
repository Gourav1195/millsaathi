import {
  proRateSaudaValuePaise,
  saudaAgreedValuePaise,
  type SaudaCommercialRow,
} from '../../../shared/quantity';
import { formatSaudaCode } from './format';

export type SaudaStockRef = SaudaCommercialRow & {
  id: string;
  code?: string;
  direction?: 'in' | 'out';
  status?: string;
  fulfilment_status?: string;
  supplier_id?: string | null;
  buyer_id?: string | null;
  item_id?: string | null;
  supplier_name?: string;
  buyer_name?: string;
  item_name?: string;
  fulfilled_qty_base?: number;
  moisture_pct?: number | null;
};

export { proRateSaudaValuePaise, saudaAgreedValuePaise };

export function saudaRemainingKg(sauda: Pick<SaudaStockRef, 'qty_kg' | 'fulfilled_qty_base'>) {
  const total = Number(sauda.qty_kg ?? 0);
  const delivered = Number(sauda.fulfilled_qty_base ?? 0);
  return Math.max(0, total - delivered);
}

export function saudaIsOpenForStock(sauda: SaudaStockRef) {
  if (sauda.direction !== 'in') return false;
  if (String(sauda.status ?? '').toLowerCase() === 'disputed') return false;
  if (String(sauda.fulfilment_status ?? '').toUpperCase() === 'FULFILLED') return false;
  return saudaRemainingKg(sauda) > 0;
}

/** @deprecated use proRateSaudaValuePaise */
export function proRatedSaudaValuePaise(sauda: SaudaCommercialRow, qtyKg: number) {
  return proRateSaudaValuePaise(sauda, qtyKg);
}

export function saudaMatchesQuery(sauda: SaudaStockRef, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    formatSaudaCode(sauda.code, sauda.direction),
    sauda.supplier_name,
    sauda.buyer_name,
    sauda.item_name,
  ].join(' ').toLowerCase();
  return haystack.includes(normalized);
}

export function qtlFromKg(kg?: number) {
  return `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
}
