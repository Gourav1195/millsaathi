'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Billing = { plan: string; status: string; provider: string | null; current_period_start: string | null; current_period_end: string | null; checkout_available: boolean };

export function BillingApp() {
  const { session, sessionError } = useSession();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/billing/status', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load billing status'); setBilling(body.billing as Billing); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load billing status')); }, [session]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading billing…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Billing</h2><p className="muted">Your current MillSaathi service status.</p></div><Link className="primary" href="/app/dashboard">Dashboard</Link></div>{error && <p className="error">{error}</p>}{!billing && !error && <p className="muted">Loading billing status…</p>}{billing && <section className="billing-card"><span className="eyebrow">Current plan</span><h3>{billing.plan}</h3><p><strong>Status:</strong> {billing.status}</p><p><strong>Provider:</strong> {billing.provider ?? 'Not configured'}</p>{billing.current_period_end && <p><strong>Current period ends:</strong> {billing.current_period_end}</p>}<p className="muted">MillSaathi is currently free. Checkout is intentionally unavailable until a payment integration is implemented.</p></section>}</section></main>;
}
