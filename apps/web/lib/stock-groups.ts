export type StockLotView = {
  id: string;
  code: string;
  item_id?: string;
  item_name?: string;
  qty_kg?: number;
  godown_name?: string | null;
  sauda_id?: string | null;
  sauda_code?: string | null;
  gate_token_no?: string | null;
  gate_vehicle_no?: string | null;
};

export type StockLotGroupView = {
  group_key: string;
  item_name: string;
  sauda_code: string | null;
  total_qty_kg: number;
  lots: StockLotView[];
};

export function groupLotsForDisplay(lots: StockLotView[]): StockLotGroupView[] {
  const groups = new Map<string, StockLotGroupView>();
  for (const lot of lots) {
    if (!lot.item_id || !(lot.qty_kg ?? 0)) continue;
    const key = `${lot.item_id}:${lot.sauda_id ?? 'unlinked'}`;
    const existing = groups.get(key);
    if (existing) {
      existing.total_qty_kg += lot.qty_kg ?? 0;
      existing.lots.push(lot);
    } else {
      groups.set(key, {
        group_key: key,
        item_name: lot.item_name ?? 'Item',
        sauda_code: lot.sauda_code ?? null,
        total_qty_kg: lot.qty_kg ?? 0,
        lots: [lot],
      });
    }
  }
  return [...groups.values()].sort((left, right) => right.total_qty_kg - left.total_qty_kg);
}
