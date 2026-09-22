'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Party = { id: string; name: string; phone?: string | null; city?: string | null; gstin?: string | null; outstanding_paise?: number; receivable_paise?: number; supplied_kg?: number; purchased_kg?: number; last_at?: string | null };
type PartyKind = 'suppliers' | 'buyers';
const money = (paise: number | undefined) => paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export function PartiesApp() {
  const { session, sessionError } = useSession();
  const [kind, setKind] = useState<PartyKind>('suppliers');
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [buyers, setBuyers] = useState<Party[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/overview', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load parties'); setSuppliers(body.suppliers as Party[]); setBuyers(body.buyers as Party[]); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load parties')); }, [session]);
  const parties = kind === 'suppliers' ? suppliers : buyers;
  const filtered = useMemo(() => parties.filter((party) => `${party.name} ${party.phone ?? ''} ${party.city ?? ''}`.toLowerCase().includes(query.toLowerCase())), [parties, query]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading parties…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Parties</h2><p className="muted">Supplier and buyer directory. New-party, archive, and payment workflows remain in the legacy app while their validations are migrated.</p></div><Link className="primary" href="/app/purchase">Open Saudās</Link></div>{error && <p className="error">{error}</p>}<div className="party-controls"><div className="filter-tabs" role="group" aria-label="Party type"><button className={kind === 'suppliers' ? 'selected' : ''} onClick={() => setKind('suppliers')}>Suppliers</button><button className={kind === 'buyers' ? 'selected' : ''} onClick={() => setKind('buyers')}>Buyers</button></div><input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, or city" aria-label="Search parties" /></div><section className="panel" style={{ marginTop: 16 }}><div className="party-header"><span>Name</span><span>Phone</span><span>City</span><span>GSTIN</span><span>{kind === 'suppliers' ? 'Payable' : 'Receivable'}</span></div>{filtered.map((party) => <div className="party-row" key={party.id}><strong>{party.name}</strong><span>{party.phone ?? '—'}</span><span>{party.city ?? '—'}</span><span>{party.gstin ?? '—'}</span><strong>{session.role === 'manager' ? 'Restricted' : money(kind === 'suppliers' ? party.outstanding_paise : party.receivable_paise)}</strong></div>)}{!filtered.length && <p className="muted">No matching {kind}.</p>}</section></section></main>;
}
