'use client';

import { AppLink } from './app-link';
import { useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Digest = { date: string; trucks_in: number; paddy_in_kg: number; dispatched_kg: number; cash_paid_paise?: number; mass_balance: { unexplained_pct?: number }; text: string; wa_share_url: string };
const qtl = (kg: number) => `${(kg / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })} qtl`;

export function DigestApp() {
  const { session, sessionError } = useSession();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/digest', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load digest'); setDigest(body as Digest); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load digest')); }, [session]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading digest…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Night Digest</h2><p className="muted">A shareable end-of-day operational summary.</p></div><AppLink className="primary" href="/app/dashboard">Dashboard</AppLink></div>{error && <p className="error">{error}</p>}{!digest && !error && <p className="muted">Generating today’s digest…</p>}{digest && <><div className="kpi-grid"><Metric label="Incoming trucks" value={String(digest.trucks_in)} /><Metric label="Incoming" value={qtl(digest.paddy_in_kg)} /><Metric label="Dispatched" value={qtl(digest.dispatched_kg)} /><Metric label="Unexplained loss" value={`${digest.mass_balance.unexplained_pct ?? 0}%`} /></div><section className="digest-card"><pre>{digest.text}</pre><a className="primary" href={digest.wa_share_url} target="_blank" rel="noreferrer">Share on WhatsApp</a></section></>}</section></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><span>{label}</span><strong>{value}</strong></article>; }
