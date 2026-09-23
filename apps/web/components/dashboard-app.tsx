'use client';

import { AppLink } from './app-link';
import { useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';
import { Button, Card } from './ui';

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
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1><p className="muted">Log in before opening your dashboard.</p>{error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;
  const kpis = overview?.kpis ?? {};
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><header className="app-page-header"><div><h1>Dashboard</h1><p>Today at a glance · Owner view</p></div><div className="app-page-actions"><div className="period-toggle"><Button className="selected" type="button">Daily</Button><Button type="button">Weekly</Button><Button type="button">Monthly</Button></div><strong>{overview?.today ?? 'Today'}</strong></div></header>{error && <p className="error">{error}</p>}{!overview && !error && <p className="muted">Loading operational data…</p>}{overview && <><div className="kpi-grid dashboard-kpis"><Metric label="Gross margin today" value={rupees(kpis.gross_margin_today_paise)} detail="sales − purchases" /><Metric label="Unexplained loss" value={kpis.unexplained_pct == null ? '—' : `${kpis.unexplained_pct}%`} detail="today's mass balance" /><Metric label="Cash paid today" value={rupees(kpis.cash_paid_today_paise)} detail={`${kpis.weighed_today ?? 0} trucks completed`} /><Metric label="Stock value" value={rupees(kpis.stock_value_paise)} detail="posted ledger value" /></div><Card className="dashboard-card"><div className="card-title-row"><div><h2>Current stock by item</h2><p>Normalized ledger quantities</p></div><AppLink href="/app/stock"><Button className="quiet">View stock</Button></AppLink></div>{overview.stock_by_item.length ? overview.stock_by_item.slice(0, 8).map((item) => <div className="ledger-row" key={item.item_name}><span>{item.item_name}</span><strong>{qtl(item.quantity_base)}</strong></div>) : <p className="empty-state">No posted stock movements yet.</p>}</Card><div className="dashboard-grid"><Card className="dashboard-card"><div className="card-title-row"><div><h2>Attention needed</h2><p>Exceptions that need an owner decision</p></div></div>{overview.alerts.length ? overview.alerts.map((alert) => <article className={`alert ${alert.level}`} key={`${alert.title}-${alert.body}`}><strong>{alert.title}</strong><span>{alert.body}</span></article>) : <p className="empty-state">No operational alerts right now.</p>}</Card><Card className="dashboard-card"><div className="card-title-row"><div><h2>Processing</h2><p>Active production chains</p></div><AppLink href="/app"><Button className="quiet">Open processing</Button></AppLink></div>{overview.active_chain_runs.length ? overview.active_chain_runs.map((run) => <div className="ledger-row" key={run.code}><span>{run.code}</span><strong>{run.status}</strong></div>) : <p className="empty-state">No active process chains.</p>}</Card></div></>}</section></main>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <Card className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></Card>; }
