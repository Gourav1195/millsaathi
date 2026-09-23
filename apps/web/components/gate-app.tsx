'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Panel,
  ScreenToolbar,
  Select,
  TableActions,
  TableCard,
  Tab,
  TabRow,
} from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type GateEntry = { id: string; vehicle_no?: string; direction?: 'in' | 'out'; status?: string; item_name?: string; supplier_name?: string; buyer_name?: string; net_kg?: number };
type Reference = { id: string; name: string };

const qtl = (kg?: number) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
const wholeKg = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

const GATE_COLUMNS = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'direction', label: 'Direction' },
  { id: 'party', label: 'Party' },
  { id: 'material', label: 'Material' },
  { id: 'net', label: 'Net weight' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '' },
];

export function GateApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Reference[]>([]);
  const [buyers, setBuyers] = useState<Reference[]>([]);
  const [items, setItems] = useState<Reference[]>([]);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ direction: 'in', vehicle_no: '', party_id: '', item_id: '', gross_kg: '', tare_kg: '' });

  const load = async () => {
    const body = await api<{ gate: GateEntry[]; suppliers: Reference[]; buyers: Reference[]; items: Reference[] }>('/api/overview');
    setEntries(body.gate);
    setSuppliers(body.suppliers);
    setBuyers(body.buyers);
    setItems(body.items);
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load gate entries'));
  }, [session]);

  const visible = useMemo(() => entries.filter((e) => filter === 'all' || e.direction === filter), [entries, filter]);
  const parties = form.direction === 'in' ? suppliers : buyers;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const gross = wholeKg(form.gross_kg);
    const tare = wholeKg(form.tare_kg);
    if (!form.vehicle_no.trim() || !form.party_id || gross == null || tare == null || gross < tare) {
      setError('Enter a vehicle, party, and whole-kilogram gross and tare weights (gross must be at least tare).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const party = form.direction === 'in' ? { supplier_id: form.party_id } : { buyer_id: form.party_id };
      const created = await api<{ id: string }>('/api/gate', json('POST', { direction: form.direction, vehicle_no: form.vehicle_no, item_id: form.item_id || undefined, ...party }));
      await api(`/api/gate/${created.id}`, json('PATCH', { gross_kg: gross, tare_kg: tare, status: 'weighed' }));
      setForm({ ...form, vehicle_no: '', party_id: '', item_id: '', gross_kg: '', tare_kg: '' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save gate entry');
    } finally {
      setSaving(false);
    }
  }

  async function complete(entry: GateEntry) {
    const gross = window.prompt('Gross weight in whole kg');
    const tare = window.prompt('Tare weight in whole kg');
    if (gross == null || tare == null) return;
    const g = wholeKg(gross);
    const t = wholeKg(tare);
    if (g == null || t == null || g < t) {
      setError('Gross and tare must be whole kg, and gross must be at least tare.');
      return;
    }
    try {
      await api(`/api/gate/${entry.id}`, json('PATCH', { gross_kg: g, tare_kg: t, status: 'done' }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete gate entry');
    }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading gate entries…</p></main>;
  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Sign in required</h1>
          {sessionError && <p className="error">{sessionError}</p>}
          <AppLink className="primary" href="/app">Go to login</AppLink>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <PageHeader
          title="Gate & weighbridge"
          subtitle="Capture controlled whole-kg weights. Completed weights remain immutable in the Worker."
          date={headerMeta.date}
          season={headerMeta.season}
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        <Panel title="Add New gate entry">
          <FormGrid onSubmit={submit}>
            <Field label="Direction">
              <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value, party_id: '' })}>
                <option value="in">Arriving</option>
                <option value="out">Dispatching</option>
              </Select>
            </Field>
            <Field label="Vehicle">
              <Input required value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} />
            </Field>
            <Field label="Party">
              <Select required value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })}>
                <option value="">Select</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Item">
              <Select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                <option value="">Not specified</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>
            <Field label="Gross kg">
              <Input required inputMode="numeric" value={form.gross_kg} onChange={(e) => setForm({ ...form, gross_kg: e.target.value })} />
            </Field>
            <Field label="Tare kg">
              <Input required inputMode="numeric" value={form.tare_kg} onChange={(e) => setForm({ ...form, tare_kg: e.target.value })} />
            </Field>
            <div className="form-actions">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save weighment'}</Button>
            </div>
          </FormGrid>
        </Panel>

        <TableCard
          title="Gate entries"
          subtitle={`${visible.length} entr${visible.length === 1 ? 'y' : 'ies'}`}
          toolbar={
            <ScreenToolbar>
              <TabRow role="group" aria-label="Gate direction">
                <Tab selected={filter === 'all'} onClick={() => setFilter('all')}>All</Tab>
                <Tab selected={filter === 'in'} onClick={() => setFilter('in')}>Arriving</Tab>
                <Tab selected={filter === 'out'} onClick={() => setFilter('out')}>Dispatching</Tab>
              </TabRow>
            </ScreenToolbar>
          }
        >
          <DataTable columns={GATE_COLUMNS}>
            {visible.length ? visible.map((entry) => (
              <tr key={entry.id}>
                <td><strong>{entry.vehicle_no ?? '—'}</strong></td>
                <td>{entry.direction === 'in' ? 'Arriving' : 'Dispatching'}</td>
                <td>{entry.direction === 'in' ? entry.supplier_name ?? '—' : entry.buyer_name ?? '—'}</td>
                <td>{entry.item_name ?? '—'}</td>
                <td><strong>{qtl(entry.net_kg)}</strong></td>
                <td><Badge tone={entry.status === 'done' ? 'success' : 'warning'}>{entry.status ?? '—'}</Badge></td>
                <td>
                  <TableActions>
                    {entry.status !== 'done' && (
                      <Button type="button" className="secondary" onClick={() => void complete(entry)}>Complete</Button>
                    )}
                  </TableActions>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={GATE_COLUMNS.length}><EmptyState>No gate entries in this view.</EmptyState></td>
              </tr>
            )}
          </DataTable>
        </TableCard>
      </section>
    </main>
  );
}
