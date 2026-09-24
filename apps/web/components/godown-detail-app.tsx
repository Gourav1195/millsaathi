'use client';

import { AppLink } from './app-link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppHeader } from './app-header';
import {
  Badge,
  DataTable,
  EmptyState,
  TableCard,
} from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { formatDate, formatQtl, formatRupee, formatSaudaCode } from '../lib/format';
import { canViewFinance } from '../lib/permissions';
import { useSession } from '../lib/session';
import { api } from '../lib/api';

type Godown = {
  id: string;
  name: string;
  stock_kg?: number;
  capacity_kg?: number;
  location?: string | null;
};

type StockItem = {
  item_id: string;
  item_name: string;
  quantity_base: number;
};

type Receipt = {
  lot_id: string;
  lot_code: string;
  qty_kg: number;
  value_paise?: number;
  in_date?: string;
  item_name?: string;
  token_no?: string | null;
  sauda_id?: string | null;
  sauda_code?: string | null;
  direction?: 'in' | 'out';
  rate_paise_per_qtl?: number;
  supplier_name?: string | null;
  buyer_name?: string | null;
  source_type?: 'sauda' | 'gate' | 'manual';
};

type GodownDetail = {
  godown: Godown;
  stock_by_item: StockItem[];
  receipts: Receipt[];
};

const CHART_COLORS = ['#BE8A16', '#256238', '#2A5CA8', '#8C6B3F', '#CBB78C', '#98A2B3', '#6B4FA0', '#C45C4A'];

function godownFill(stockKg: number, capacityKg: number) {
  if (capacityKg <= 0) return { fill: 0, tone: 'success' as const };
  const fill = Math.min(100, Math.round((stockKg / capacityKg) * 100));
  if (fill > 85) return { fill, tone: 'danger' as const };
  if (fill > 60) return { fill, tone: 'warning' as const };
  return { fill, tone: 'success' as const };
}

function StockCompositionChart({ items }: { items: StockItem[] }) {
  const total = items.reduce((sum, row) => sum + Number(row.quantity_base), 0);
  const segments = useMemo(() => {
    if (total <= 0) return [];
    let cursor = 0;
    return items.map((row, index) => {
      const share = Number(row.quantity_base) / total;
      const start = cursor;
      cursor += share * 100;
      return {
        ...row,
        color: CHART_COLORS[index % CHART_COLORS.length],
        start,
        end: cursor,
        pct: Math.round(share * 1000) / 10,
      };
    });
  }, [items, total]);

  const gradient = segments.length
    ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ')})`
    : 'var(--line)';

  return (
    <div className="godown-chart">
      <div className="godown-chart-visual" style={{ background: gradient }} aria-hidden="true">
        <div className="godown-chart-hole">
          <strong>{formatQtl(total)}</strong>
          <span>on hand</span>
        </div>
      </div>
      <ul className="godown-chart-legend">
        {segments.map((segment) => (
          <li key={segment.item_id}>
            <span className="godown-chart-swatch" style={{ background: segment.color }} aria-hidden="true" />
            <span className="godown-chart-label">{segment.item_name}</span>
            <strong>{formatQtl(segment.quantity_base)}</strong>
            <span className="godown-chart-pct">{segment.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function receiptParty(receipt: Receipt) {
  if (receipt.direction === 'out') return receipt.buyer_name ?? 'Buyer';
  return receipt.supplier_name ?? 'Supplier';
}

function receiptTypeLabel(receipt: Receipt) {
  if (receipt.sauda_code) return receipt.direction === 'out' ? 'Sale sauda' : 'Purchase sauda';
  if (receipt.source_type === 'gate') return 'Gate receipt';
  return 'Manual lot';
}

export function GodownDetailApp() {
  const searchParams = useSearchParams();
  const godownId = searchParams.get('id') ?? '';
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [detail, setDetail] = useState<GodownDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !godownId) return;
    void api<GodownDetail>(`/api/godowns/${godownId}`)
      .then(setDetail)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load godown'));
  }, [session, godownId]);

  const canMoney = canViewFinance(session ?? { role: '' });
  const godown = detail?.godown;
  const stockItems = detail?.stock_by_item ?? [];
  const receipts = detail?.receipts ?? [];
  const fillMeta = godown ? godownFill(godown.stock_kg ?? 0, godown.capacity_kg ?? 0) : null;

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading godown…</p></main>;
  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Sign in required</h1>
          {error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}
          <AppLink className="primary" href="/app">Go to login</AppLink>
        </div>
      </main>
    );
  }

  if (!godownId) {
    return (
      <main className="shell">
        <AppHeader session={session} />
        <section className="workspace">
          <AppLink className="godown-back-link" href="/app/stock">← Back to stock</AppLink>
          <EmptyState>Choose a godown from the stock page to view its breakdown.</EmptyState>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <AppLink className="godown-back-link" href="/app/stock">← Back to stock</AppLink>

        <header className="app-page-header godown-detail-header">
          <div>
            <h1>{godown?.name ?? 'Godown'}</h1>
            <p>
              {godown ? `${formatQtl(godown.stock_kg)} on hand` : 'Loading inventory…'}
              {godown?.location ? ` · ${godown.location}` : ''}
            </p>
          </div>
          <div className="app-page-actions">
            {fillMeta ? <Badge tone={fillMeta.tone}>{fillMeta.fill}% full</Badge> : null}
            <div className="date-chip">
              <div className="d">{headerMeta.date}</div>
              {headerMeta.season ? <div className="s">{headerMeta.season}</div> : null}
            </div>
          </div>
        </header>

        {error ? <p className="error">{error}</p> : null}
        {!detail && !error ? <p className="muted">Loading godown details…</p> : null}

        {detail ? (
          <>
            <TableCard title="Stock composition" subtitle="Items currently stored in this godown">
              {stockItems.length ? (
                <StockCompositionChart items={stockItems} />
              ) : (
                <EmptyState>No posted stock in this godown yet.</EmptyState>
              )}
            </TableCard>

            <TableCard
              title="Purchases & saudas"
              subtitle={`${receipts.length} lot${receipts.length === 1 ? '' : 's'} with quantity on hand`}
            >
              <DataTable
                columns={[
                  { id: 'lot', label: 'Lot' },
                  { id: 'type', label: 'Type' },
                  { id: 'sauda', label: 'Sauda / truck' },
                  { id: 'party', label: 'Party' },
                  { id: 'item', label: 'Item' },
                  { id: 'qty', label: 'Qty on hand' },
                  ...(canMoney ? [{ id: 'value', label: 'Value' }, { id: 'rate', label: 'Rate / qtl' }] : []),
                  { id: 'date', label: 'In date' },
                ]}
              >
                {receipts.length ? receipts.map((receipt) => (
                  <tr key={receipt.lot_id}>
                    <td><strong className="dashboard-token">{receipt.lot_code}</strong></td>
                    <td>{receiptTypeLabel(receipt)}</td>
                    <td>
                      {receipt.sauda_code
                        ? formatSaudaCode(receipt.sauda_code, receipt.direction)
                        : receipt.token_no ?? '—'}
                    </td>
                    <td>{receiptParty(receipt)}</td>
                    <td>{receipt.item_name ?? '—'}</td>
                    <td><strong>{formatQtl(receipt.qty_kg)}</strong></td>
                    {canMoney ? (
                      <>
                        <td><strong>{formatRupee(receipt.value_paise)}</strong></td>
                        <td>{formatRupee(receipt.rate_paise_per_qtl)}</td>
                      </>
                    ) : null}
                    <td className="muted">{receipt.in_date ? formatDate(receipt.in_date) : '—'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={canMoney ? 9 : 7}>
                      <EmptyState>No purchase or sauda lots are stored in this godown.</EmptyState>
                    </td>
                  </tr>
                )}
              </DataTable>
            </TableCard>
          </>
        ) : null}
      </section>
    </main>
  );
}
