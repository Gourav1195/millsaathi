import { stockReceiptBagInfo, stockReceiptRemainingKg, type StockReceiptItem, type StockReceiptRow } from './stock-receipts';

export type SettlementOutcome = 'REJECTED' | 'ACCEPTED';

export type SettlementLineDraft = {
  id: string;
  outcome: SettlementOutcome;
  bags: string;
  quantity_qtl: string;
  rate_inr: string;
  reason: string;
};

export function emptySettlementLine(outcome: SettlementOutcome = 'REJECTED'): SettlementLineDraft {
  return {
    id: crypto.randomUUID(),
    outcome,
    bags: '',
    quantity_qtl: '',
    rate_inr: '',
    reason: '',
  };
}

export function receiptDefaultRatePaise(receipt: { sauda_rate_paise_per_qtl?: number; gate_rate_paise_per_qtl?: number }) {
  return receipt.sauda_rate_paise_per_qtl ?? receipt.gate_rate_paise_per_qtl ?? 0;
}

export function settlementUsesBags(receipt: StockReceiptRow, items: StockReceiptItem[]) {
  return stockReceiptBagInfo(receipt, items) != null;
}

export function settlementRemainingBags(receipt: StockReceiptRow, items: StockReceiptItem[]) {
  return stockReceiptBagInfo(receipt, items)?.remainingBags ?? 0;
}

export function settlementRemainingQtl(receipt: StockReceiptRow) {
  return stockReceiptRemainingKg(receipt) / 100;
}

export function summarizeSettlementLines(
  lines: SettlementLineDraft[],
  usesBags: boolean,
): { allocated: number; accepted: number; rejected: number; payablePaise: number; remaining: number } {
  let allocated = 0;
  let accepted = 0;
  let rejected = 0;
  let payablePaise = 0;

  for (const line of lines) {
    const amount = usesBags ? Number(line.bags) : Number(line.quantity_qtl);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    allocated += amount;
    if (line.outcome === 'ACCEPTED') {
      accepted += amount;
      const rateInr = Number(line.rate_inr);
      if (Number.isFinite(rateInr) && rateInr >= 0) {
        payablePaise += usesBags
          ? Math.round(amount * rateInr * 100)
          : Math.round(amount * 100 * rateInr);
      }
    } else {
      rejected += amount;
    }
  }

  return { allocated, accepted, rejected, payablePaise, remaining: 0 };
}

export function validateSettlementLines(
  lines: SettlementLineDraft[],
  usesBags: boolean,
  remainingTotal: number,
): string | null {
  if (!lines.length) return 'Add at least one line.';
  let allocated = 0;
  for (const line of lines) {
    const amount = usesBags ? Number(line.bags) : Number(line.quantity_qtl);
    if (usesBags) {
      if (!Number.isInteger(amount) || amount <= 0) return 'Each line needs a whole bag count.';
    } else if (!Number.isFinite(amount) || amount <= 0) {
      return 'Each line needs a positive quantity in quintals.';
    }
    if (line.outcome === 'ACCEPTED') {
      const rateInr = Number(line.rate_inr);
      if (!Number.isFinite(rateInr) || rateInr < 0) return 'Accepted lines need a non-negative rate.';
    }
    allocated += amount;
  }
  const matchesTotal = usesBags
    ? allocated === remainingTotal
    : Math.abs(allocated - remainingTotal) <= 0.001;
  if (!matchesTotal) {
    return usesBags
      ? `Lines must account for all ${remainingTotal} remaining bag${remainingTotal === 1 ? '' : 's'}.`
      : `Lines must account for all ${remainingTotal.toFixed(3)} qtl remaining.`;
  }
  return null;
}

export function settlementLinesToPayload(lines: SettlementLineDraft[], usesBags: boolean) {
  return lines.map((line) => ({
    outcome: line.outcome,
    ...(usesBags
      ? { bags: Number(line.bags), rate_unit: 'BAG' as const }
      : { quantity: Number(line.quantity_qtl), unit: 'QUINTAL' as const, rate_unit: 'QTL' as const }),
    ...(line.outcome === 'ACCEPTED' ? { rate_inr: Number(line.rate_inr) } : {}),
    ...(line.reason.trim() ? { reason: line.reason.trim() } : {}),
  }));
}
