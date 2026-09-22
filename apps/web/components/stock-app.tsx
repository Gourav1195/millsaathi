'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Lot = { id: string; code: string; item_name?: string; qty_kg?: number; godown_name?: string; in_date?: string; status?: string };
const quantity = (kg: number | undefined) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 3 })} qtl`;

export function StockApp() {
  const { session, sessionError } = useSession();
  const [lots, setLots] = useState<Lot[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/overview', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load stock'); setLots(body.lots as Lot[]); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load stock')); }, [session]);
  const filtered = useMemo(() => lots.filter((lot) => `${lot.code} ${lot.item_name ?? ''} ${lot.godown_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [lots, query]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading stock…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Stock lots</h2><p className="muted">Read-only migrated view. Lot corrections remain in the existing app until that workflow is ported.</p></div><Link className="primary" href="/app">Open Processing</Link></div>{error && <p className="error">{error}</p>}<input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lot, item, or godown" aria-label="Search stock lots" /><section className="panel" style={{ marginTop: 16 }}><div className="stock-header"><span>Lot</span><span>Item</span><span>Godown</span><span>Available</span><span>Date</span></div>{filtered.map((lot) => <div className="stock-row" key={lot.id}><strong>{lot.code}</strong><span>{lot.item_name ?? '—'}</span><span>{lot.godown_name ?? '—'}</span><strong>{quantity(lot.qty_kg)}</strong><span>{lot.in_date ?? '—'}</span></div>)}{!filtered.length && <p className="muted">No matching stock lots.</p>}</section></section></main>;
}
