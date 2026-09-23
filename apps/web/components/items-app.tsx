'use client';

import { AppLink } from './app-link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Item = { id: string; name: string; category?: string | null; category_code?: string | null; hsn?: string | null; unit?: string | null; base_unit?: string | null; display_unit?: string | null; typical_otr_pct?: number | null };

export function ItemsApp() {
  const { session, sessionError } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', category: 'paddy', hsn: '', display_unit: 'QUINTAL', typical_otr_pct: '' });
  const load = async () => { const body = await api<{ items: Item[] }>('/api/overview'); setItems(body.items); };
  useEffect(() => { if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load items')); }, [session]);
  async function save(event: React.FormEvent) { event.preventDefault(); if (!form.name.trim()) return setError('Item name is required.'); try { await api('/api/items', json('POST', { ...form, typical_otr_pct: form.typical_otr_pct === '' ? undefined : Number(form.typical_otr_pct) })); setForm({ ...form, name: '', hsn: '', typical_otr_pct: '' }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create item'); } }
  async function edit(item: Item) { const name = window.prompt('Item name', item.name); if (!name?.trim()) return; try { await api(`/api/items/${item.id}`, json('PATCH', { name: name.trim() })); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update item'); } }
  const filtered = useMemo(() => items.filter((item) => `${item.name} ${item.category ?? ''} ${item.hsn ?? ''}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading items…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Items</h2><p className="muted">Item quantities retain the Worker’s KG base unit.</p></div><AppLink className="primary" href="/app">Open Processing</AppLink></div>{error && <p className="error">{error}</p>}<section className="panel"><h2>New item</h2><form className="workflow-form" onSubmit={save}><label>Name<input required value={form.name} onChange={e => setForm({...form,name:e.target.value})}/></label><label>Category<select value={form.category} onChange={e => setForm({...form,category:e.target.value})}><option value="paddy">Paddy</option><option value="rice">Rice</option><option value="byproduct">Byproduct</option><option value="packaging">Packaging</option><option value="consumable">Consumable</option><option value="other">Other</option></select></label><label>HSN<input value={form.hsn} onChange={e => setForm({...form,hsn:e.target.value})}/></label><label>Display unit<select value={form.display_unit} onChange={e => setForm({...form,display_unit:e.target.value})}><option>KG</option><option>QUINTAL</option><option>TONNE</option></select></label><label>Typical OTR %<input inputMode="decimal" value={form.typical_otr_pct} onChange={e => setForm({...form,typical_otr_pct:e.target.value})}/></label><button className="post">Create item</button></form></section><input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, category, or HSN" aria-label="Search items" /><section className="panel" style={{ marginTop: 16 }}><div className="item-header"><span>Item</span><span>Category</span><span>HSN</span><span>Base unit</span><span>Display unit</span><span>Typical OTR</span></div>{filtered.map((item) => <div className="item-row" key={item.id}><strong>{item.name}</strong><span>{item.category ?? item.category_code ?? '—'}</span><span>{item.hsn ?? '—'}</span><span>{item.base_unit ?? 'KG'}</span><span>{item.display_unit ?? item.unit ?? '—'}</span><span className="inline-actions">{item.typical_otr_pct == null ? '—' : `${item.typical_otr_pct}%`}<button onClick={() => void edit(item)}>Edit</button></span></div>)}{!filtered.length && <p className="muted">No matching items.</p>}</section></section></main>;
}
