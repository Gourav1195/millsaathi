'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Overview = {
  today: string;
  kpis: Record<string, number | undefined>;
  alerts: { level: 'red' | 'amber' | 'blue'; title: string; body: string }[];
  stock_by_item: { item_name: string; quantity_base: number }[];
  active_chain_runs: { code: string; status: string }[];
};

const qtl = (kg: number | undefined) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
const rupees = (paise: number | undefined) => paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export function DashboardApp() {
  const { session, sessionError } = useSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    void fetch('/api/overview', { credentials: 'include' }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load overview');
      setOverview(body as Overview);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load overview'));
  }, [session]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading dashboard…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1><p className="muted">Log in before opening your dashboard.</p>{error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}<Link className="primary" href="/app">Go to login</Link></div></main>;
  const kpis = overview?.kpis ?? {};
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Dashboard</h2><p className="muted">Operational snapshot for {overview?.today ?? 'today'}.</p></div><Link className="primary" href="/app">Open Processing</Link></div>{error && <p className="error">{error}</p>}{!overview && !error && <p className="muted">Loading operational data…</p>}{overview && <><div className="kpi-grid"><Metric label="Incoming today" value={qtl(kpis.incoming_today_kg)} /><Metric label="Outgoing today" value={qtl(kpis.outgoing_today_kg)} /><Metric label="Weighed today" value={String(kpis.weighed_today ?? 0)} /><Metric label="In gate queue" value={String(kpis.trucks_in_queue ?? 0)} /><Metric label="Payables" value={rupees(kpis.payables_paise)} /><Metric label="Receivables" value={rupees(kpis.receivables_paise)} /></div><div className="dashboard-grid"><section className="panel"><h2>Attention needed</h2>{overview.alerts.length ? overview.alerts.map((alert) => <article className={`alert ${alert.level}`} key={`${alert.title}-${alert.body}`}><strong>{alert.title}</strong><span>{alert.body}</span></article>) : <p className="muted">No operational alerts right now.</p>}</section><section className="panel"><h2>Current stock</h2>{overview.stock_by_item.slice(0, 8).map((item) => <div className="line" key={item.item_name}><span>{item.item_name}</span><strong>{qtl(item.quantity_base)}</strong></div>)}{!overview.stock_by_item.length && <p className="muted">No posted stock movements yet.</p>}</section></div>{overview.active_chain_runs.length > 0 && <section className="panel" style={{ marginTop: 16 }}><h2>Active process chains</h2>{overview.active_chain_runs.map((run) => <div className="line" key={run.code}><span>{run.code}</span><strong>{run.status}</strong></div>)}</section>}</>}</section></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><span>{label}</span><strong>{value}</strong></article>; }
