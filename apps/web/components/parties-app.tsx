'use client';

import { AppLink } from './app-link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

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
  const [form, setForm] = useState({ name: '', phone: '', city: '' });
  const load = async () => { const body = await api<{ suppliers: Party[]; buyers: Party[] }>('/api/overview'); setSuppliers(body.suppliers); setBuyers(body.buyers); };
  useEffect(() => { if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load parties')); }, [session]);
  async function create(event: React.FormEvent) { event.preventDefault(); if (!form.name.trim()) return setError('Party name is required.'); const endpoint = kind === 'suppliers' ? '/api/suppliers' : '/api/buyers'; const payload = kind === 'suppliers' ? { name: form.name, phone: form.phone, place: form.city, type: 'farmer' } : { name: form.name, phone: form.phone, location: form.city, type: 'Wholesaler' }; try { await api(endpoint, json('POST', payload)); setForm({name:'',phone:'',city:''}); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create party'); } }
  async function archive(party: Party) { if (!window.confirm(`Archive ${party.name}?`)) return; try { await api(`/api/${kind}/${party.id}`, json('DELETE', {})); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not archive party'); } }
  async function payment(party: Party) { const amount = window.prompt('Amount in rupees'); if (!amount) return; const paise = Math.round(Number(amount) * 100); if (!Number.isFinite(paise) || paise <= 0) return setError('Enter a positive payment amount.'); try { await api('/api/payments', json('POST', { party_kind: kind === 'suppliers' ? 'supplier' : 'buyer', party_id: party.id, amount_paise: paise, method: 'cash' })); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record payment'); } }
  const parties = kind === 'suppliers' ? suppliers : buyers;
  const filtered = useMemo(() => parties.filter((party) => `${party.name} ${party.phone ?? ''} ${party.city ?? ''}`.toLowerCase().includes(query.toLowerCase())), [parties, query]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading parties…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Parties</h2><p className="muted">Party mutations are validated and tenant-scoped by the Worker.</p></div><AppLink className="primary" href="/app/purchase">Open Saudās</AppLink></div>{error && <p className="error">{error}</p>}<div className="party-controls"><div className="filter-tabs" role="group" aria-label="Party type"><button className={kind === 'suppliers' ? 'selected' : ''} onClick={() => setKind('suppliers')}>Suppliers</button><button className={kind === 'buyers' ? 'selected' : ''} onClick={() => setKind('buyers')}>Buyers</button></div><input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, or city" aria-label="Search parties" /></div><section className="panel" style={{marginTop:16}}><h2>New {kind.slice(0,-1)}</h2><form className="workflow-form" onSubmit={create}><label>Name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>City<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><button className="post">Create</button></form></section><section className="panel" style={{ marginTop: 16 }}><div className="party-header"><span>Name</span><span>Phone</span><span>City</span><span>GSTIN</span><span>{kind === 'suppliers' ? 'Payable' : 'Receivable'}</span></div>{filtered.map((party) => <div className="party-row" key={party.id}><strong>{party.name}</strong><span>{party.phone ?? '—'}</span><span>{party.city ?? '—'}</span><span>{party.gstin ?? '—'}</span><strong className="inline-actions">{session.role === 'manager' ? 'Restricted' : money(kind === 'suppliers' ? party.outstanding_paise : party.receivable_paise)}{session.role !== 'manager' && <><button onClick={() => void payment(party)}>Payment</button><button onClick={() => void archive(party)}>Archive</button></>}</strong></div>)}{!filtered.length && <p className="muted">No matching {kind}.</p>}</section></section></main>;
}
