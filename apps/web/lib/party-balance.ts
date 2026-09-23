import { formatRupee } from './format';

export type PartyBalanceKind = 'receivable' | 'outstanding' | 'commission';

export type SaudaBrokerRef = {
  broker_name?: string | null;
  commission_paise?: number | null;
  status?: string | null;
};

const BALANCE_LABEL: Record<PartyBalanceKind, string> = {
  receivable: 'Receivable',
  outstanding: 'Outstanding',
  commission: 'Commission due',
};

export function balanceColumnLabel(tab: 'all' | 'buyers' | 'sellers' | 'brokers') {
  if (tab === 'buyers') return 'Receivable';
  if (tab === 'sellers') return 'Outstanding';
  if (tab === 'brokers') return 'Commission due';
  return 'Balance';
}

export function brokerSaudaCount(brokerName: string, saudas: SaudaBrokerRef[]) {
  const normalized = brokerName.trim().toLowerCase();
  if (!normalized || normalized === 'direct') return 0;
  return saudas.filter((sauda) => String(sauda.broker_name ?? '').trim().toLowerCase() === normalized).length;
}

export function brokerCommissionDuePaise(brokerName: string, saudas: SaudaBrokerRef[]) {
  const normalized = brokerName.trim().toLowerCase();
  if (!normalized || normalized === 'direct') return 0;
  return saudas.reduce((sum, sauda) => {
    if (String(sauda.broker_name ?? '').trim().toLowerCase() !== normalized) return sum;
    if (String(sauda.status ?? '').toLowerCase() === 'disputed') return sum;
    return sum + (Number(sauda.commission_paise) || 0);
  }, 0);
}

export function partyBalanceMeta(
  role: 'buyer' | 'seller' | 'broker',
  balancePaise: number | undefined,
  restricted: boolean,
) {
  const kind: PartyBalanceKind = role === 'buyer' ? 'receivable' : role === 'broker' ? 'commission' : 'outstanding';
  const label = BALANCE_LABEL[kind];
  const amount = balancePaise ?? 0;

  if (restricted) {
    return { kind, label, display: 'Restricted', color: 'var(--muted)' };
  }

  if (role === 'broker' && amount <= 0) {
    return { kind, label, display: '—', color: 'var(--muted)' };
  }

  const color = role === 'buyer'
    ? (amount > 0 ? 'var(--ink)' : 'var(--muted)')
    : role === 'broker'
      ? (amount > 0 ? '#A16207' : 'var(--muted)')
      : (amount > 0 ? 'var(--red)' : 'var(--muted)');

  return { kind, label, display: formatRupee(amount), color };
}
