'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Sauda = { id: string; code?: string; direction?: 'in' | 'out'; status?: string; fulfilment_status?: string; supplier_name?: string; buyer_name?: string; item_name?: string; qty_kg?: number; fulfilled_qty_base?: number; rate_paise_per_qtl?: number };
type Reference = { id: string; name: string };
type Overview = { saudas: Sauda[]; suppliers: Reference[]; buyers: Reference[]; items: Reference[]; godowns: Reference[] };
type Delivery = { id: string; actual_date?: string; actual_qty_base?: number; actual_qty?: number; actual_unit?: string; status?: string; gate_entry_id?: string | null; lot_code?: string | null; notes?: string | null };
type AgreementForm = { direction: 'in' | 'out'; party_id: string; item_id: string; quantity: string; unit: string; rate: string; agreement_date: string; delivery_start: string; delivery_end: string; tolerance: string; broker: string; note: string };

const qtl = (kg: number | undefined) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
const money = (paise: number | undefined) => paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const today = () => new Date().toISOString().slice(0, 10);
const blankAgreement = (): AgreementForm => ({ direction: 'in', party_id: '', item_id: '', quantity: '', unit: 'QUINTAL', rate: '', agreement_date: today(), delivery_start: '', delivery_end: '', tolerance: '5', broker: 'Direct', note: '' });
const blankDelivery = () => ({ quantity: '', unit: 'KG', actual_date: today(), godown_id: '', notes: '' });

export function PurchaseApp() {
  const { session, sessionError } = useSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
  const [agreement, setAgreement] = useState(blankAgreement);
  const [delivery, setDelivery] = useState(blankDelivery);
  const [deliveryFor, setDeliveryFor] = useState<Sauda | null>(null);
  const [historyFor, setHistoryFor] = useState<Sauda | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => setOverview(await api<Overview>('/api/overview'));
  useEffect(() => { if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load Saudās')); }, [session]);
  const visibleSaudas = useMemo(() => (overview?.saudas ?? []).filter((sauda) => direction === 'all' || sauda.direction === direction), [overview, direction]);
  const canManage = session != null && ['owner', 'admin', 'accountant'].includes(session.role);
  const parties = agreement.direction === 'in' ? overview?.suppliers ?? [] : overview?.buyers ?? [];

  async function createAgreement(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(agreement.quantity);
    const ratePaise = Math.round(Number(agreement.rate) * 100);
    if (!agreement.party_id || !agreement.item_id || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(ratePaise) || ratePaise < 0) { setError('Choose a party and item, then enter a positive quantity and a valid rate.'); return; }
    setSaving(true); setError(null);
    try {
      await api('/api/saudas', json('POST', { direction: agreement.direction, ...(agreement.direction === 'in' ? { supplier_id: agreement.party_id } : { buyer_id: agreement.party_id }), item_id: agreement.item_id, quantity, unit: agreement.unit, rate_paise_per_qtl: ratePaise, agreement_date: agreement.agreement_date, delivery_start: agreement.delivery_start || null, delivery_end: agreement.delivery_end || null, delivery_tolerance_pct: Number(agreement.tolerance), broker_name: agreement.broker.trim() || 'Direct', note: agreement.note.trim() || null }));
      setAgreement(blankAgreement()); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create Sauda'); } finally { setSaving(false); }
  }

  async function changeStatus(sauda: Sauda, status: string) {
    try { setError(null); await api(`/api/saudas/${sauda.id}`, json('PATCH', { status })); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update Sauda'); }
  }

  async function addDelivery(event: FormEvent) {
    event.preventDefault();
    if (!deliveryFor) return;
    const quantity = Number(delivery.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) { setError('Enter a positive delivery quantity.'); return; }
    setSaving(true); setError(null);
    try {
      const result = await api<{ warning?: boolean }>(`/api/saudas/${deliveryFor.id}/deliveries`, json('POST', { actual_qty: quantity, actual_unit: delivery.unit, actual_date: delivery.actual_date, godown_id: delivery.godown_id || null, notes: delivery.notes.trim() || null }));
      setDeliveryFor(null); setDelivery(blankDelivery()); await load();
      if (result.warning) setError('Delivery was saved, but it exceeds this agreement’s configured tolerance.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save delivery'); } finally { setSaving(false); }
  }
  async function openHistory(sauda: Sauda) {
    try { setError(null); setHistoryFor(sauda); setDeliveries((await api<{ deliveries: Delivery[] }>(`/api/saudas/${sauda.id}/deliveries`)).deliveries); }
    catch (cause) { setHistoryFor(null); setError(cause instanceof Error ? cause.message : 'Could not load delivery history'); }
  }
  async function voidDelivery(entry: Delivery) {
    const reason = window.prompt('Reason for voiding this manual delivery (at least 3 characters)');
    if (!reason) return;
    try { setError(null); await api(`/api/sauda-deliveries/${entry.id}/void`, json('POST', { reason })); if (historyFor) await openHistory(historyFor); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not void delivery'); }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading Saudās…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;

  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Saudās</h2><p className="muted">Purchase and sales agreements, fulfilment, and settlement status.</p></div><AppLink className="primary" href="/app/gate">Open Gate</AppLink></div>{error && <p className="error">{error}</p>}
    {canManage && <section className="panel"><h2>New agreement</h2><form className="workflow-form" onSubmit={createAgreement}><label>Type<select value={agreement.direction} onChange={e => setAgreement({ ...agreement, direction: e.target.value as 'in' | 'out', party_id: '' })}><option value="in">Purchase / arriving</option><option value="out">Sale / dispatch</option></select></label><label>{agreement.direction === 'in' ? 'Supplier' : 'Buyer'}<select required value={agreement.party_id} onChange={e => setAgreement({ ...agreement, party_id: e.target.value })}><option value="">Select</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Item<select required value={agreement.item_id} onChange={e => setAgreement({ ...agreement, item_id: e.target.value })}><option value="">Select</option>{(overview?.items ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Quantity<input required type="number" min="0.001" step="0.001" value={agreement.quantity} onChange={e => setAgreement({ ...agreement, quantity: e.target.value })} /></label><label>Unit<select value={agreement.unit} onChange={e => setAgreement({ ...agreement, unit: e.target.value })}><option>KG</option><option>QUINTAL</option><option>TONNE</option></select></label><label>Rate ₹ / qtl<input required type="number" min="0" step="0.01" value={agreement.rate} onChange={e => setAgreement({ ...agreement, rate: e.target.value })} /></label><label>Agreement date<input required type="date" value={agreement.agreement_date} onChange={e => setAgreement({ ...agreement, agreement_date: e.target.value })} /></label><label>Delivery starts<input type="date" value={agreement.delivery_start} onChange={e => setAgreement({ ...agreement, delivery_start: e.target.value })} /></label><label>Delivery ends<input type="date" value={agreement.delivery_end} onChange={e => setAgreement({ ...agreement, delivery_end: e.target.value })} /></label><label>Tolerance %<input type="number" min="0" max="100" step="0.1" value={agreement.tolerance} onChange={e => setAgreement({ ...agreement, tolerance: e.target.value })} /></label><label>Broker<input value={agreement.broker} onChange={e => setAgreement({ ...agreement, broker: e.target.value })} /></label><label>Terms<textarea value={agreement.note} onChange={e => setAgreement({ ...agreement, note: e.target.value })} /></label><button className="post" disabled={saving}>{saving ? 'Saving…' : 'Create agreement'}</button></form></section>}
    {deliveryFor && <section className="panel" style={{ marginTop: 16 }}><h2>Manual delivery · {deliveryFor.code ?? 'Agreement'}</h2><form className="workflow-form" onSubmit={addDelivery}><label>Quantity<input required type="number" min="0.001" step="0.001" value={delivery.quantity} onChange={e => setDelivery({ ...delivery, quantity: e.target.value })} /></label><label>Unit<select value={delivery.unit} onChange={e => setDelivery({ ...delivery, unit: e.target.value })}><option>KG</option><option>QUINTAL</option><option>TONNE</option></select></label><label>Date<input required type="date" value={delivery.actual_date} onChange={e => setDelivery({ ...delivery, actual_date: e.target.value })} /></label><label>Godown<select value={delivery.godown_id} onChange={e => setDelivery({ ...delivery, godown_id: e.target.value })}><option value="">Not specified</option>{(overview?.godowns ?? []).map(godown => <option key={godown.id} value={godown.id}>{godown.name}</option>)}</select></label><label>Notes<textarea value={delivery.notes} onChange={e => setDelivery({ ...delivery, notes: e.target.value })} /></label><div className="workflow-actions"><button className="post" disabled={saving}>{saving ? 'Saving…' : 'Save delivery'}</button><button className="secondary" type="button" onClick={() => setDeliveryFor(null)}>Cancel</button></div></form></section>}
    {historyFor && <section className="panel" style={{ marginTop: 16 }}><div className="party-controls"><h2>Delivery history · {historyFor.code ?? 'Agreement'}</h2><button className="secondary" onClick={() => setHistoryFor(null)}>Close</button></div>{deliveries.length ? deliveries.map(entry => <div className="line" key={entry.id}><span>{entry.actual_date ?? '—'} · {qtl(entry.actual_qty_base)}{entry.lot_code ? ` · ${entry.lot_code}` : ''}{entry.gate_entry_id ? ' · Gate-linked' : ''}</span><span className="inline-actions"><strong className="status">{entry.status ?? 'POSTED'}</strong>{canManage && entry.status === 'POSTED' && !entry.gate_entry_id && <button onClick={() => void voidDelivery(entry)}>Void</button>}</span></div>) : <p className="muted">No deliveries recorded.</p>}</section>}
    <div className="filter-tabs" style={{ marginTop: 16 }} role="group" aria-label="Sauda type"><button className={direction === 'all' ? 'selected' : ''} onClick={() => setDirection('all')}>All</button><button className={direction === 'in' ? 'selected' : ''} onClick={() => setDirection('in')}>Purchases</button><button className={direction === 'out' ? 'selected' : ''} onClick={() => setDirection('out')}>Sales</button></div><section className="panel" style={{ marginTop: 16 }}><div className="sauda-header"><span>Code</span><span>Type</span><span>Party</span><span>Material</span><span>Agreed</span><span>Fulfilled</span><span>Status</span></div>{visibleSaudas.map((sauda) => <div className="sauda-row" key={sauda.id}><strong>{sauda.code ?? '—'}</strong><span>{sauda.direction === 'out' ? 'Sale' : 'Purchase'}</span><span>{sauda.direction === 'out' ? sauda.buyer_name ?? '—' : sauda.supplier_name ?? '—'}</span><span>{sauda.item_name ?? '—'}</span><span>{qtl(sauda.qty_kg)}</span><span>{qtl(sauda.fulfilled_qty_base)}</span><span className="inline-actions"><span className="status">{sauda.fulfilment_status ?? sauda.status ?? '—'}</span><button onClick={() => void openHistory(sauda)}>History</button>{canManage && <><button onClick={() => setDeliveryFor(sauda)}>Delivery</button><select aria-label={`Status for ${sauda.code ?? 'Sauda'}`} value={sauda.status ?? 'open'} onChange={e => void changeStatus(sauda, e.target.value)}><option value="open">Open</option><option value="advance_paid">Advance paid</option><option value="settled">Settled</option><option value="disputed">Disputed</option></select></>}</span></div>)}{!visibleSaudas.length && <p className="muted">No Saudās in this view.</p>}</section>{session.role !== 'manager' && <p className="muted" style={{ marginTop: 12 }}>Rate visibility is server-controlled. Listed rate values, where permitted: {visibleSaudas.slice(0, 3).map((sauda) => `${sauda.code ?? 'Agreement'} ${money(sauda.rate_paise_per_qtl)}/qtl`).join(' · ') || '—'}</p>}</section></main>;
}
