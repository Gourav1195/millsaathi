'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Item = { id: string; name: string; category?: string | null; category_code?: string | null; hsn?: string | null; unit?: string | null; base_unit?: string | null; display_unit?: string | null; typical_otr_pct?: number | null };

export function ItemsApp() {
  const { session, sessionError } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/overview', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load items'); setItems(body.items as Item[]); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load items')); }, [session]);
  const filtered = useMemo(() => items.filter((item) => `${item.name} ${item.category ?? ''} ${item.hsn ?? ''}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading items…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Items</h2><p className="muted">Material catalog used throughout stock, gate, and processing. Item creation and edits remain in the legacy app while validation rules are ported.</p></div><Link className="primary" href="/app">Open Processing</Link></div>{error && <p className="error">{error}</p>}<input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, category, or HSN" aria-label="Search items" /><section className="panel" style={{ marginTop: 16 }}><div className="item-header"><span>Item</span><span>Category</span><span>HSN</span><span>Base unit</span><span>Display unit</span><span>Typical OTR</span></div>{filtered.map((item) => <div className="item-row" key={item.id}><strong>{item.name}</strong><span>{item.category ?? item.category_code ?? '—'}</span><span>{item.hsn ?? '—'}</span><span>{item.base_unit ?? 'KG'}</span><span>{item.display_unit ?? item.unit ?? '—'}</span><span>{item.typical_otr_pct == null ? '—' : `${item.typical_otr_pct}%`}</span></div>)}{!filtered.length && <p className="muted">No matching items.</p>}</section></section></main>;
}
