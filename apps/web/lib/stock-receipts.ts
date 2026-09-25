import { deriveAverageKgPerBag, itemUsesFixedPackage, itemUsesVariableBags } from '../../../shared/quantity';

export type StockReceiptItem = {
  id: string;
  tracking_mode?: string | null;
  package_unit?: string | null;
  package_quantity_base?: number | null;
  gate_bag_count_required?: number | null;
};

export type StockReceiptRow = {
  id: string;
  item_id?: string;
  net_kg?: number;
  allocated_qty_kg?: number;
  allocated_bag_count?: number;
  observed_bag_count?: number | null;
  stock_status?: string;
};

export type StockReceiptBagInfo = {
  totalBags: number;
  remainingBags: number;
  allocatedBags: number;
  averageKgPerBag: number | null;
  remainingKg: number;
  usesVariableBags: boolean;
  usesFixedBags: boolean;
};

export function stockReceiptRemainingKg(receipt: StockReceiptRow) {
  const net = Math.max(0, Math.round(receipt.net_kg ?? 0));
  const allocated = Math.max(0, Math.round(receipt.allocated_qty_kg ?? 0));
  return Math.max(0, net - allocated);
}

export function stockReceiptBagInfo(
  receipt: StockReceiptRow,
  items: StockReceiptItem[],
): StockReceiptBagInfo | null {
  if (!receipt.item_id) return null;
  const item = items.find((entry) => entry.id === receipt.item_id);
  if (!item) return null;

  const usesVariableBags = itemUsesVariableBags(item.tracking_mode);
  const usesFixedBags = itemUsesFixedPackage(item.tracking_mode)
    || (String(item.package_unit ?? '').toUpperCase() === 'BAG' && Number(item.package_quantity_base) > 0);

  if (!usesVariableBags && !usesFixedBags) return null;

  const net = Math.max(0, Math.round(receipt.net_kg ?? 0));
  const remainingKg = stockReceiptRemainingKg(receipt);
  const allocatedKg = Math.max(0, net - remainingKg);

  if (usesVariableBags) {
    const totalBags = receipt.observed_bag_count;
    if (totalBags == null) return null;
    const allocatedBags = Math.max(0, Math.round(receipt.allocated_bag_count ?? 0));
    const remainingBags = Math.max(0, totalBags - allocatedBags);
    return {
      totalBags,
      remainingBags,
      allocatedBags,
      averageKgPerBag: deriveAverageKgPerBag(net, totalBags),
      remainingKg,
      usesVariableBags: true,
      usesFixedBags: false,
    };
  }

  const kgPerBag = Number(item.package_quantity_base);
  if (!Number.isFinite(kgPerBag) || kgPerBag <= 0) return null;
  const totalBags = Math.max(1, Math.round(net / kgPerBag));
  const remainingBags = Math.max(0, Math.round(remainingKg / kgPerBag));
  const allocatedBags = Math.max(0, totalBags - remainingBags);
  return {
    totalBags,
    remainingBags,
    allocatedBags,
    averageKgPerBag: kgPerBag,
    remainingKg,
    usesVariableBags: false,
    usesFixedBags: true,
  };
}
