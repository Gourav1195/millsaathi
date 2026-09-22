'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type GateEntry = { id: string; vehicle_no?: string; direction?: 'in' | 'out'; status?: string; item_name?: string; supplier_name?: string; buyer_name?: string; net_kg?: number; entry_date?: string; moisture_pct?: number | null };
const qtl = (kg: number | undefined) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;

export function GateApp() {
  const { session, sessionError } = useSession();
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/overview', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load gate entries'); setEntries(body.gate as GateEntry[]); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load gate entries')); }, [session]);
  const visibleEntries = useMemo(() => entries.filter((entry) => filter === 'all' || entry.direction === filter), [entries, filter]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading gate entries…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Gate & weighbridge</h2><p className="muted">Read-only migration view. Existing gate-entry and weight-correction actions stay in the legacy surface until their controlled forms are ported.</p></div><Link className="primary" href="/app">Open Processing</Link></div>{error && <p className="error">{error}</p>}<div className="filter-tabs" role="group" aria-label="Gate direction"><button onClick={() => setFilter('all')} className={filter === 'all' ? 'selected' : ''}>All</button><button onClick={() => setFilter('in')} className={filter === 'in' ? 'selected' : ''}>Arriving</button><button onClick={() => setFilter('out')} className={filter === 'out' ? 'selected' : ''}>Dispatching</button></div><section className="panel" style={{ marginTop: 16 }}><div className="gate-header"><span>Vehicle</span><span>Direction</span><span>Party</span><span>Material</span><span>Net weight</span><span>Status</span></div>{visibleEntries.map((entry) => <div className="gate-row" key={entry.id}><strong>{entry.vehicle_no ?? '—'}</strong><span>{entry.direction === 'in' ? 'Arriving' : 'Dispatching'}</span><span>{entry.direction === 'in' ? entry.supplier_name ?? '—' : entry.buyer_name ?? '—'}</span><span>{entry.item_name ?? '—'}</span><strong>{qtl(entry.net_kg)}</strong><span className={`status ${entry.status ?? 'unknown'}`}>{entry.status ?? '—'}</span></div>)}{!visibleEntries.length && <p className="muted">No gate entries in this view.</p>}</section></section></main>;
}
