'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Lot = { id: string; code: string; item_name?: string; qty_kg?: number; godown_id?: string | null; godown_name?: string; in_date?: string; status?: string; moisture_pct?: number | null; value_paise?: number; note?: string | null };
type Godown = { id: string; name: string };
type Overview = { lots: Lot[]; godowns: Godown[] };
type LotForm = { quantity: string; unit: string; godown_id: string; moisture: string; value: string; note: string };
const quantity = (kg: number | undefined) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 3 })} qtl`;
const initialForm = (lot: Lot): LotForm => ({ quantity: String((lot.qty_kg ?? 0) / 100), unit: 'QUINTAL', godown_id: lot.godown_id ?? '', moisture: lot.moisture_pct == null ? '' : String(lot.moisture_pct), value: lot.value_paise == null ? '' : String(lot.value_paise / 100), note: lot.note ?? '' });

export function StockApp() {
  const { session, sessionError } = useSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Lot | null>(null);
  const [form, setForm] = useState<LotForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => setOverview(await api<Overview>('/api/overview'));
  useEffect(() => { if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load stock')); }, [session]);
  const filtered = useMemo(() => (overview?.lots ?? []).filter((lot) => `${lot.code} ${lot.item_name ?? ''} ${lot.godown_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [overview, query]);
  const canEdit = session != null && !['viewer', 'manager'].includes(session.role);

  function startEdit(lot: Lot) { setError(null); setEditing(lot); setForm(initialForm(lot)); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || !form) return;
    const quantityValue = Number(form.quantity);
    const moisture = form.moisture === '' ? null : Number(form.moisture);
    const valuePaise = form.value === '' ? undefined : Math.round(Number(form.value) * 100);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0 || (moisture != null && (!Number.isFinite(moisture) || moisture < 0 || moisture > 100)) || (valuePaise != null && (!Number.isFinite(valuePaise) || valuePaise < 0))) { setError('Enter a positive quantity, a moisture value from 0–100, and a non-negative value.'); return; }
    setSaving(true); setError(null);
    try {
      await api(`/api/lots/${editing.id}`, json('PATCH', { quantity: quantityValue, unit: form.unit, godown_id: form.godown_id, moisture_pct: moisture, ...(valuePaise == null ? {} : { value_paise: valuePaise }), note: form.note }));
      setEditing(null); setForm(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update stock lot'); } finally { setSaving(false); }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading stock…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{error || sessionError ? <p className="error">{error ?? sessionError}</p> : null}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Stock lots</h2><p className="muted">Lot adjustments write balancing ledger movements in the Worker.</p></div><AppLink className="primary" href="/app">Open Processing</AppLink></div>{error && <p className="error">{error}</p>}
    {editing && form && <section className="panel"><h2>Edit {editing.code}</h2><form className="workflow-form" onSubmit={save}><label>Quantity<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label><label>Unit<select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}><option>KG</option><option>QUINTAL</option><option>TONNE</option></select></label><label>Godown<select value={form.godown_id} onChange={e => setForm({ ...form, godown_id: e.target.value })}><option value="">Not specified</option>{(overview?.godowns ?? []).map(godown => <option key={godown.id} value={godown.id}>{godown.name}</option>)}</select></label><label>Moisture %<input type="number" min="0" max="100" step="0.1" value={form.moisture} onChange={e => setForm({ ...form, moisture: e.target.value })} /></label><label>Value ₹<input type="number" min="0" step="0.01" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></label><label>Note<textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label><div className="workflow-actions"><button className="post" disabled={saving}>{saving ? 'Saving…' : 'Save adjustment'}</button><button className="secondary" type="button" onClick={() => { setEditing(null); setForm(null); }}>Cancel</button></div></form></section>}
    <input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lot, item, or godown" aria-label="Search stock lots" /><section className="panel" style={{ marginTop: 16 }}><div className="stock-header"><span>Lot</span><span>Item</span><span>Godown</span><span>Available</span><span>Date</span></div>{filtered.map((lot) => <div className="stock-row" key={lot.id}><strong>{lot.code}</strong><span>{lot.item_name ?? '—'}</span><span>{lot.godown_name ?? '—'}</span><strong>{quantity(lot.qty_kg)}</strong><span className="inline-actions">{lot.in_date ?? '—'}{canEdit && <button onClick={() => startEdit(lot)}>Adjust</button>}</span></div>)}{!filtered.length && <p className="muted">No matching stock lots.</p>}</section></section></main>;
}
