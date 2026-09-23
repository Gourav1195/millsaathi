export const PAGE_SIZE = 25;

export type ListFilters = Record<string, string>;

export function filterRows<T extends Record<string, unknown>>(
  rows: T[],
  query: string,
  filters: ListFilters,
  options: {
    quantityKg?: (row: T) => number | null | undefined;
    match?: (row: T, filters: ListFilters) => boolean;
  } = {},
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesSearch = !q || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q));
    const matchesCustom = options.match ? options.match(row, filters) : true;
    const qtyKg = options.quantityKg?.(row);
    const qtyQtl = qtyKg == null ? null : qtyKg / 100;
    const minQty = filters.min_qty ? Number(filters.min_qty) : null;
    const maxQty = filters.max_qty ? Number(filters.max_qty) : null;
    const matchesQty = qtyQtl == null || ((!minQty || qtyQtl >= minQty) && (!maxQty || qtyQtl <= maxQty));
    return matchesSearch && matchesCustom && matchesQty;
  });
}

export function paginate<T>(rows: T[], page: number, pageSize = PAGE_SIZE) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const index = Math.min(Math.max(0, page), pages - 1);
  return {
    rows: rows.slice(index * pageSize, (index + 1) * pageSize),
    total,
    index,
    pages,
    pageSize,
  };
}

export function uniqueValues<T>(rows: T[], pick: (row: T) => string | null | undefined) {
  return [...new Set(rows.map((row) => pick(row)).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}
