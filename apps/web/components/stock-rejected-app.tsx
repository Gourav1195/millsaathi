'use client';

import { AppLink } from './app-link';
import { useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  TableCard,
} from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { formatDate, formatQtl } from '../lib/format';
import { can } from '../lib/permissions';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type RejectedReceipt = {
  id: string;
  token_no?: string;
  supplier_name?: string;
  item_name?: string;
  net_kg?: number;
  stock_note?: string | null;
  updated_at?: string;
  can_reopen?: number | boolean;
};

export function StockRejectedApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [rejected, setRejected] = useState<RejectedReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = can(session, 'stock:edit');

  const load = async () => {
    const data = await api<{ rejected_receipts: RejectedReceipt[] }>('/api/stock-receipts/rejected');
    setRejected(data.rejected_receipts ?? []);
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load rejected trucks'));
  }, [session]);

  async function reopenReceipt(receiptId: string) {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/stock-receipts/${receiptId}/reopen`, json('POST', {}));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore rejected truck');
    } finally {
      setSaving(false);
    }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading rejected trucks…</p></main>;
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

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <PageHeader
          title="Rejected trucks"
          subtitle="All trucks rejected from stock intake"
          date={headerMeta.date}
          season={headerMeta.season}
          actions={
            <AppLink className="secondary ui-button" href="/app/stock">Back to stock</AppLink>
          }
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        <TableCard
          title="Rejected stock receipts"
          subtitle={`${rejected.length} truck${rejected.length === 1 ? '' : 's'}`}
          className="rejected-receipts rejected-receipts--page"
        >
          {rejected.length ? (
            <div className="rejected-receipt-list">
              {rejected.map((receipt) => (
                <div key={receipt.id} className="rejected-receipt">
                  <div>
                    <strong>{receipt.token_no ?? 'Truck'}</strong>
                    <span>
                      {receipt.supplier_name ?? 'Supplier'} · {receipt.item_name ?? 'Item'} · {formatQtl(receipt.net_kg)}
                    </span>
                    {receipt.stock_note ? <span className="rejected-receipt-note">{receipt.stock_note}</span> : null}
                    {receipt.updated_at ? <span className="rejected-receipt-date">Rejected {formatDate(receipt.updated_at.slice(0, 10))}</span> : null}
                  </div>
                  {canEdit && receipt.can_reopen ? (
                    <Button type="button" className="quiet" disabled={saving} onClick={() => void reopenReceipt(receipt.id)}>
                      Restore to stock
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No rejected trucks recorded yet.</EmptyState>
          )}
        </TableCard>
      </section>
    </main>
  );
}
