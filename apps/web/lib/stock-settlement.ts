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

/** Pro-rate truck deal value by received kg using the agreed sauda or gate rate. */
export function receiptProRatedValuePaise(
  receipt: { sauda_rate_paise_per_qtl?: number; gate_rate_paise_per_qtl?: number },
  qtyKg: number,
) {
  return Math.round(Math.max(0, qtyKg) * (receiptDefaultRatePaise(receipt) / 100));
}

function lineNominalPaiseAtAgreedRate(
  amount: number,
  usesBags: boolean,
  agreedRatePaisePerQtl: number,
  averageKgPerBag: number | null,
) {
  if (usesBags) {
    const kgPerBag = averageKgPerBag && averageKgPerBag > 0 ? averageKgPerBag : 0;
    return Math.round(amount * kgPerBag * (agreedRatePaisePerQtl / 100));
  }
  return Math.round(amount * agreedRatePaisePerQtl);
}

function linePayablePaise(
  line: SettlementLineDraft,
  amount: number,
  usesBags: boolean,
) {
  const rateInr = Number(line.rate_inr);
  if (!Number.isFinite(rateInr) || rateInr < 0) return 0;
  return usesBags
    ? Math.round(amount * rateInr * 100)
    : Math.round(amount * 100 * rateInr);
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
  agreedRatePaisePerQtl = 0,
  averageKgPerBag: number | null = null,
): {
  allocated: number;
  accepted: number;
  rejected: number;
  payablePaise: number;
  rejectedValuePaise: number;
  qualityReductionPaise: number;
  nominalDealPaise: number;
  remaining: number;
} {
  let allocated = 0;
  let accepted = 0;
  let rejected = 0;
  let payablePaise = 0;
  let rejectedValuePaise = 0;
  let qualityReductionPaise = 0;
  let nominalDealPaise = 0;

  for (const line of lines) {
    const amount = usesBags ? Number(line.bags) : Number(line.quantity_qtl);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    allocated += amount;
    const nominalPaise = lineNominalPaiseAtAgreedRate(amount, usesBags, agreedRatePaisePerQtl, averageKgPerBag);
    nominalDealPaise += nominalPaise;
    if (line.outcome === 'ACCEPTED') {
      accepted += amount;
      const negotiatedPaise = linePayablePaise(line, amount, usesBags);
      payablePaise += negotiatedPaise;
      qualityReductionPaise += Math.max(0, nominalPaise - negotiatedPaise);
    } else {
      rejected += amount;
      rejectedValuePaise += nominalPaise;
    }
  }

  return {
    allocated,
    accepted,
    rejected,
    payablePaise,
    rejectedValuePaise,
    qualityReductionPaise,
    nominalDealPaise,
    remaining: 0,
  };
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
