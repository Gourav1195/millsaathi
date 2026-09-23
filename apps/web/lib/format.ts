/** Locale-aware display helpers — quantities stay in kg internally; UI shows quintals. */

const LOCALE = 'en-IN';

export function formatQtl(kg: number | undefined, digits = 2) {
  return `${((kg ?? 0) / 100).toLocaleString(LOCALE, { maximumFractionDigits: digits })} qtl`;
}

export function formatRupee(paise: number | null | undefined, fallback = '—') {
  if (paise == null) return fallback;
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}

export function formatDate(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
