import { formatRupee } from './format';

export type DetailRow = { label: string; value: string };

function shortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function pct(value: number | null | undefined, fallback = '5.0%') {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${value.toFixed(1)}%`;
}

function saudaCommission(sauda: {
  commission_type?: string | null;
  commission_value?: number | null;
  commission_paise?: number | null;
}) {
  if (!sauda.commission_type) return 'None';
  if (sauda.commission_type === 'fixed') return `Fixed · ${formatRupee(sauda.commission_paise ?? 0)}`;
  if (sauda.commission_type === 'per_unit') {
    const rupees = (Number(sauda.commission_value ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return `₹${rupees} / quintal`;
  }
  if (sauda.commission_type === 'percentage') {
    return `${Number(sauda.commission_value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}% of deal value`;
  }
  return String(sauda.commission_type);
}

export type SaudaDetailSource = {
  broker_name?: string | null;
  agreement_date?: string | null;
  delivery_start?: string | null;
  delivery_end?: string | null;
  delivery_tolerance_pct?: number | null;
  advance_paise?: number | null;
  note?: string | null;
  commission_type?: string | null;
  commission_value?: number | null;
  commission_paise?: number | null;
};

export function saudaDetailRows(sauda: SaudaDetailSource, showMoney: boolean): DetailRow[] {
  const delivery = sauda.delivery_start || sauda.delivery_end
    ? `${shortDate(sauda.delivery_start)} → ${shortDate(sauda.delivery_end)}`
    : 'Not set';
  const rows: DetailRow[] = [
    { label: 'Broker', value: sauda.broker_name?.trim() || 'Direct' },
    { label: 'Agreement date', value: shortDate(sauda.agreement_date) },
    { label: 'Delivery window', value: delivery },
    { label: 'Over-delivery limit', value: pct(sauda.delivery_tolerance_pct) },
  ];
  if (showMoney) {
    rows.splice(1, 0,
      { label: 'Broker commission', value: saudaCommission(sauda) },
      { label: 'Advance', value: formatRupee(sauda.advance_paise ?? 0) },
    );
  }
  return rows;
}

export type PartyDetailSource = {
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
};

export function partyDetailRows(party: PartyDetailSource): DetailRow[] {
  return [
    { label: 'Phone', value: party.phone?.trim() || '—' },
    { label: 'Email', value: party.email?.trim() || '—' },
    { label: 'GSTIN', value: party.gstin?.trim() || '—' },
    { label: 'Address', value: party.address?.trim() || '—' },
  ];
}

export function hasPartyDetails(party: PartyDetailSource) {
  return Boolean(party.phone?.trim() || party.email?.trim() || party.gstin?.trim() || party.address?.trim());
}
