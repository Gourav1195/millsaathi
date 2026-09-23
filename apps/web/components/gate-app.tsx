'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './app-header';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FormActions,
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
import { can } from '../lib/permissions';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type GateEntry = {
  id: string;
  token_no?: string;
  vehicle_no?: string;
  direction?: 'in' | 'out';
  status?: string;
  item_name?: string;
  supplier_name?: string;
  buyer_name?: string;
  net_kg?: number;
  gross_kg?: number | null;
  tare_kg?: number | null;
  moisture_pct?: number | null;
  quality_json?: string | null;
};

type Reference = { id: string; name: string };

type GateEditForm = {
  gross_kg: string;
  tare_kg: string;
  moisture_pct: string;
  broken_pct: string;
  foreign_matter_pct: string;
  damaged_pct: string;
  grade: string;
  status: string;
};

const GATE_STATUSES = [
  { value: 'at_gate', label: 'At gate' },
  { value: 'weighing', label: 'Weighing' },
  { value: 'in_lab', label: 'In lab' },
  { value: 'weighed', label: 'Weighed' },
  { value: 'unloading', label: 'Unloading' },
  { value: 'done', label: 'Done' },
];

const qtl = (kg?: number) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
const wholeKg = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

function parseQuality(qualityJson?: string | null) {
  if (!qualityJson) return {};
  try {
    return JSON.parse(qualityJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function editFormFromEntry(entry: GateEntry): GateEditForm {
  const quality = parseQuality(entry.quality_json);
  return {
    gross_kg: entry.gross_kg == null ? '' : String(entry.gross_kg),
    tare_kg: entry.tare_kg == null ? '' : String(entry.tare_kg),
    moisture_pct: entry.moisture_pct == null ? '' : String(entry.moisture_pct),
    broken_pct: quality.broken_pct == null ? '' : String(quality.broken_pct),
    foreign_matter_pct: quality.foreign_matter_pct == null ? '' : String(quality.foreign_matter_pct),
    damaged_pct: quality.damaged_pct == null ? '' : String(quality.damaged_pct),
    grade: quality.grade == null ? '' : String(quality.grade),
    status: entry.status ?? 'at_gate',
  };
}

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
  const [editing, setEditing] = useState<GateEntry | null>(null);
  const [editForm, setEditForm] = useState<GateEditForm | null>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);

  const canCreate = can(session, 'gate:create');
  const canEdit = can(session, 'gate:edit');

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

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!dialog) return;
    if (editing && editForm && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing, editForm]);

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

  function startEdit(entry: GateEntry) {
    setEditing(entry);
    setEditForm(editFormFromEntry(entry));
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
    setEditForm(null);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editForm) return;
    const body: Record<string, unknown> = { status: editForm.status };
    if (editing.status !== 'done') {
      const gross = editForm.gross_kg === '' ? null : wholeKg(editForm.gross_kg);
      const tare = editForm.tare_kg === '' ? null : wholeKg(editForm.tare_kg);
      if (editForm.gross_kg !== '' && gross == null) return setError('Gross weight must be a whole number of kg.');
      if (editForm.tare_kg !== '' && tare == null) return setError('Tare weight must be a whole number of kg.');
      if (gross != null && tare != null && gross < tare) return setError('Gross must be at least tare.');
      if (gross != null) body.gross_kg = gross;
      if (tare != null) body.tare_kg = tare;
    }
    if (editForm.moisture_pct !== '') body.moisture_pct = Number(editForm.moisture_pct);
    if (editForm.broken_pct !== '') body.broken_pct = Number(editForm.broken_pct);
    if (editForm.foreign_matter_pct !== '') body.foreign_matter_pct = Number(editForm.foreign_matter_pct);
    if (editForm.damaged_pct !== '') body.damaged_pct = Number(editForm.damaged_pct);
    if (editForm.grade !== '') body.grade = editForm.grade;

    setSaving(true);
    setError(null);
    try {
      await api(`/api/gate/${editing.id}`, json('PATCH', body));
      setEditing(null);
      setEditForm(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update gate entry');
    } finally {
      setSaving(false);
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

        {canCreate && (
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
        )}

        <dialog
          ref={editDialogRef}
          className="app-dialog"
          onClose={() => {
            if (!saving) closeEdit();
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeEdit();
          }}
        >
          {editing && editForm ? (
            <>
              <div className="app-dialog-head">
                <div>
                  <h2>Update {editing.token_no ?? editing.vehicle_no ?? 'gate entry'}</h2>
                  <p>
                    <strong>{editing.vehicle_no ?? 'Vehicle'}</strong>
                    {editing.item_name ? ` · ${editing.item_name}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="app-dialog-close ms-focus-ring"
                  aria-label="Close update gate dialog"
                  onClick={closeEdit}
                  disabled={saving}
                >
                  ×
                </button>
              </div>
              <FormGrid className="ui-form-grid--compact" onSubmit={saveEdit}>
                {editing.status !== 'done' && (
                  <>
                    <Field label="Gross kg">
                      <Input inputMode="numeric" value={editForm.gross_kg} onChange={(e) => setEditForm({ ...editForm, gross_kg: e.target.value })} />
                    </Field>
                    <Field label="Tare kg">
                      <Input inputMode="numeric" value={editForm.tare_kg} onChange={(e) => setEditForm({ ...editForm, tare_kg: e.target.value })} />
                    </Field>
                  </>
                )}
                <Field label="Moisture %">
                  <Input type="number" min="0" max="100" step="0.1" value={editForm.moisture_pct} onChange={(e) => setEditForm({ ...editForm, moisture_pct: e.target.value })} />
                </Field>
                <Field label="Broken %">
                  <Input type="number" min="0" max="100" step="0.1" value={editForm.broken_pct} onChange={(e) => setEditForm({ ...editForm, broken_pct: e.target.value })} />
                </Field>
                <Field label="Foreign matter %">
                  <Input type="number" min="0" max="100" step="0.1" value={editForm.foreign_matter_pct} onChange={(e) => setEditForm({ ...editForm, foreign_matter_pct: e.target.value })} />
                </Field>
                <Field label="Damaged %">
                  <Input type="number" min="0" max="100" step="0.1" value={editForm.damaged_pct} onChange={(e) => setEditForm({ ...editForm, damaged_pct: e.target.value })} />
                </Field>
                <Field label="Grade / quality note">
                  <Input value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} />
                </Field>
                <Field label="Status">
                  <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    {GATE_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <FormActions>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
                  <Button className="secondary" type="button" onClick={closeEdit} disabled={saving}>Cancel</Button>
                </FormActions>
              </FormGrid>
            </>
          ) : null}
        </dialog>

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
                  {canEdit && entry.status !== 'done' && (
                    <TableActions>
                      <Button type="button" className="secondary" onClick={() => startEdit(entry)}>Update</Button>
                    </TableActions>
                  )}
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
