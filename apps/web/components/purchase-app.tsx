'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Sauda = { id: string; code?: string; direction?: 'in' | 'out'; status?: string; supplier_name?: string; buyer_name?: string; item_name?: string; qty_kg?: number; fulfilled_qty_base?: number; rate_paise_per_qtl?: number; due_date?: string | null };
const qtl = (kg: number | undefined) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
const money = (paise: number | undefined) => paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export function PurchaseApp() {
  const { session, sessionError } = useSession();
  const [saudas, setSaudas] = useState<Sauda[]>([]);
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/overview', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load Saudās'); setSaudas(body.saudas as Sauda[]); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load Saudās')); }, [session]);
  const visibleSaudas = useMemo(() => saudas.filter((sauda) => direction === 'all' || sauda.direction === direction), [saudas, direction]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading Saudās…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Saudās</h2><p className="muted">Purchase and sales agreements. New agreements and fulfilment remain in the legacy app until their validated React forms are ported.</p></div><Link className="primary" href="/app/gate">Open Gate</Link></div>{error && <p className="error">{error}</p>}<div className="filter-tabs" role="group" aria-label="Sauda type"><button className={direction === 'all' ? 'selected' : ''} onClick={() => setDirection('all')}>All</button><button className={direction === 'in' ? 'selected' : ''} onClick={() => setDirection('in')}>Purchases</button><button className={direction === 'out' ? 'selected' : ''} onClick={() => setDirection('out')}>Sales</button></div><section className="panel" style={{ marginTop: 16 }}><div className="sauda-header"><span>Code</span><span>Type</span><span>Party</span><span>Material</span><span>Agreed</span><span>Fulfilled</span><span>Status</span></div>{visibleSaudas.map((sauda) => <div className="sauda-row" key={sauda.id}><strong>{sauda.code ?? '—'}</strong><span>{sauda.direction === 'out' ? 'Sale' : 'Purchase'}</span><span>{sauda.direction === 'out' ? sauda.buyer_name ?? '—' : sauda.supplier_name ?? '—'}</span><span>{sauda.item_name ?? '—'}</span><span>{qtl(sauda.qty_kg)}</span><span>{qtl(sauda.fulfilled_qty_base)}</span><span className="status">{sauda.status ?? '—'}</span></div>)}{!visibleSaudas.length && <p className="muted">No Saudās in this view.</p>}</section>{session.role !== 'manager' && <p className="muted" style={{ marginTop: 12 }}>Rate visibility is server-controlled. Listed rate values, where permitted: {visibleSaudas.slice(0, 3).map((sauda) => `${sauda.code ?? 'Agreement'} ${money(sauda.rate_paise_per_qtl)}/qtl`).join(' · ') || '—'}</p>}</section></main>;
}
