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
  TableCard,
  Tab,
  TabRow,
} from './ui';
import { TableEditModeButton } from './table-edit-mode';
import { millHeaderMeta } from '../lib/app-meta';
import { can } from '../lib/permissions';
import { useTableEditMode } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';
import { fetchGunnyOverview, type GunnyOverview } from '../lib/mill-intelligence';
import { GunnyBagsPanel } from './gunny-bags-panel';
import {
  formatVehicleNumber,
  normalizeVehicleNumber,
  sanitizeVehicleNumber,
  VEHICLE_NUMBER_ERROR,
  VEHICLE_NUMBER_MAX_LENGTH,
  VEHICLE_NUMBER_PLACEHOLDER,
} from '../../../shared/vehicle-number';
import { deriveAverageKgPerBag, gateRequiresBagCount, itemUsesVariableBags, type TrackingMode } from '../../../shared/quantity';
import { formatSaudaCode } from '../lib/format';
import { SaudaTruckTable } from './sauda-truck-table';

type Sauda = {
  id: string;
  code?: string;
  direction?: 'in' | 'out';
  status?: string;
  fulfilment_status?: string;
  supplier_id?: string | null;
  buyer_id?: string | null;
  item_id?: string | null;
  supplier_name?: string;
  buyer_name?: string;
  item_name?: string;
  qty_kg?: number;
  agreed_quantity?: number | null;
  agreed_unit?: string | null;
  fulfilled_qty_base?: number;
};

type GateEntry = {
  id: string;
  token_no?: string;
  vehicle_no?: string;
  direction?: 'in' | 'out';
  status?: string;
  item_id?: string | null;
  item_name?: string;
  supplier_name?: string;
  buyer_name?: string;
  sauda_id?: string | null;
  net_kg?: number;
  gross_kg?: number | null;
  tare_kg?: number | null;
  observed_bag_count?: number | null;
  moisture_pct?: number | null;
  quality_json?: string | null;
  stock_status?: string;
};

type Reference = {
  id: string;
  name: string;
  tracking_mode?: string | null;
  gate_bag_count_required?: number | null;
  package_quantity_base?: number | null;
};

type GateEditForm = {
  gross_kg: string;
  tare_kg: string;
  observed_bag_count: string;
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

const TABLE_SELECT_PROPS = {
  className: 'table-inline-field',
  menuClassName: 'ui-dropdown-menu--table',
  menuPlacement: 'inline' as const,
};

const GATE_COLUMNS_VIEW = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'direction', label: 'Direction' },
  { id: 'sauda', label: 'Sauda' },
  { id: 'party', label: 'Party' },
  { id: 'material', label: 'Material' },
  { id: 'net', label: 'Net weight' },
  { id: 'status', label: 'Status' },
];

const GATE_COLUMNS_EDIT = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'direction', label: 'Direction' },
  { id: 'sauda', label: 'Sauda' },
  { id: 'party', label: 'Party' },
  { id: 'material', label: 'Material' },
  { id: 'gross', label: 'Gross kg' },
  { id: 'tare', label: 'Tare kg' },
  { id: 'net', label: 'Net' },
  { id: 'moisture', label: 'Moisture %' },
  { id: 'status', label: 'Status' },
  { id: 'save', label: '' },
];

const qtl = (kg?: number) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;
const wholeKg = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

function saudaRemainingKg(sauda: Sauda) {
  const total = Number(sauda.qty_kg ?? 0);
  const delivered = Number(sauda.fulfilled_qty_base ?? 0);
  return Math.max(0, total - delivered);
}

function saudaIsOpen(sauda: Sauda) {
  if (String(sauda.status ?? '').toLowerCase() === 'disputed') return false;
  if (String(sauda.fulfilment_status ?? '').toUpperCase() === 'FULFILLED') return false;
  return saudaRemainingKg(sauda) > 0;
}

function blankGateForm() {
  return {
    sauda_id: '',
    vehicle_no: '',
    gross_kg: '',
    tare_kg: '',
    observed_bag_count: '',
  };
}

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
    observed_bag_count: entry.observed_bag_count == null ? '' : String(entry.observed_bag_count),
    moisture_pct: entry.moisture_pct == null ? '' : String(entry.moisture_pct),
    broken_pct: quality.broken_pct == null ? '' : String(quality.broken_pct),
    foreign_matter_pct: quality.foreign_matter_pct == null ? '' : String(quality.foreign_matter_pct),
    damaged_pct: quality.damaged_pct == null ? '' : String(quality.damaged_pct),
    grade: quality.grade == null ? '' : String(quality.grade),
    status: entry.status ?? 'at_gate',
  };
}

function statusLabel(status?: string) {
  return GATE_STATUSES.find((option) => option.value === status)?.label ?? status ?? '—';
}

export function GateApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [screen, setScreen] = useState<'weighbridge' | 'gunny'>('weighbridge');
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [saudas, setSaudas] = useState<Sauda[]>([]);
  const [gunny, setGunny] = useState<GunnyOverview | null>(null);
  const [items, setItems] = useState<Reference[]>([]);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [form, setForm] = useState(blankGateForm);
  const [saudaQuery, setSaudaQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, GateEditForm>>({});
  const tableEdit = useTableEditMode();

  const canCreate = can(session, 'gate:create');
  const canEdit = can(session, 'gate:edit');
  const canViewGunny = can(session, 'gate:view');
  const editing = tableEdit.editMode && canEdit;

  const load = async () => {
    const body = await api<{ gate: GateEntry[]; saudas?: Sauda[]; items: Reference[] }>('/api/overview');
    setEntries(body.gate);
    setSaudas(body.saudas ?? []);
    setItems(body.items);
  };

  const loadGunny = async () => {
    setGunny(await fetchGunnyOverview());
  };

  useEffect(() => {
    if (!session) return;
    if (screen === 'weighbridge') {
      void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load gate entries'));
      return;
    }
    void loadGunny().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load gunny bag data'));
  }, [session, screen]);

  useEffect(() => {
    if (!editing) {
      setDrafts({});
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      for (const entry of entries) {
        if (!next[entry.id]) next[entry.id] = editFormFromEntry(entry);
      }
      return next;
    });
  }, [editing, entries]);

  const visible = useMemo(() => entries.filter((e) => filter === 'all' || e.direction === filter), [entries, filter]);
  const columns = editing ? GATE_COLUMNS_EDIT : GATE_COLUMNS_VIEW;
  const saudaById = useMemo(() => new Map(saudas.map((sauda) => [sauda.id, sauda])), [saudas]);
  const eligibleSaudas = useMemo(() => saudas.filter(saudaIsOpen), [saudas]);
  const filteredEligibleSaudas = useMemo(() => {
    const query = saudaQuery.trim().toLowerCase();
    const filtered = !query
      ? eligibleSaudas
      : eligibleSaudas.filter((sauda) => {
          const haystack = [
            formatSaudaCode(sauda.code, sauda.direction),
            sauda.supplier_name,
            sauda.buyer_name,
            sauda.item_name,
          ].join(' ').toLowerCase();
          return haystack.includes(query);
        });
    if (form.sauda_id && !filtered.some((sauda) => sauda.id === form.sauda_id)) {
      const selected = saudaById.get(form.sauda_id);
      if (selected) return [selected, ...filtered];
    }
    return filtered;
  }, [eligibleSaudas, saudaQuery, form.sauda_id, saudaById]);
  const trucksBySauda = useMemo(() => {
    const map = new Map<string, GateEntry[]>();
    for (const entry of entries) {
      if (!entry.sauda_id) continue;
      map.set(entry.sauda_id, [...(map.get(entry.sauda_id) ?? []), entry]);
    }
    return map;
  }, [entries]);
  const selectedSauda = form.sauda_id ? saudaById.get(form.sauda_id) ?? null : null;
  const selectedItem = selectedSauda?.item_id ? items.find((item) => item.id === selectedSauda.item_id) ?? null : null;
  const linkedTrucks = form.sauda_id ? trucksBySauda.get(form.sauda_id) ?? [] : [];
  const formNetKg = (() => {
    const gross = wholeKg(form.gross_kg);
    const tare = wholeKg(form.tare_kg);
    if (gross == null || tare == null) return null;
    return Math.max(0, gross - tare);
  })();

  function applySauda(saudaId: string) {
    setForm((current) => ({ ...current, sauda_id: saudaId }));
  }

  function entrySaudaLabel(entry: GateEntry) {
    if (!entry.sauda_id) return '—';
    const sauda = saudaById.get(entry.sauda_id);
    if (!sauda) return entry.sauda_id.slice(0, 8);
    return formatSaudaCode(sauda.code, sauda.direction);
  }

  function updateDraft(entryId: string, patch: Partial<GateEditForm>) {
    setDrafts((current) => ({
      ...current,
      [entryId]: { ...current[entryId], ...patch },
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sauda = selectedSauda;
    if (!sauda) {
      setError('Select a sauda.');
      return;
    }
    const partyId = sauda.direction === 'out' ? sauda.buyer_id : sauda.supplier_id;
    if (!partyId || !sauda.item_id) {
      setError('This sauda is missing party or item details.');
      return;
    }
    const gross = wholeKg(form.gross_kg);
    const tare = wholeKg(form.tare_kg);
    const vehicleNo = normalizeVehicleNumber(form.vehicle_no);
    if (!vehicleNo) {
      setError(VEHICLE_NUMBER_ERROR);
      return;
    }
    if (gross == null || tare == null || gross < tare) {
      setError('Enter whole-kilogram gross and tare weights (gross must be at least tare).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const direction = sauda.direction === 'out' ? 'out' : 'in';
      const party = direction === 'in' ? { supplier_id: partyId } : { buyer_id: partyId };
      const created = await api<{ id: string }>('/api/gate', json('POST', {
        direction,
        vehicle_no: vehicleNo,
        item_id: sauda.item_id,
        sauda_id: sauda.id,
        ...party,
      }));
      const patch: Record<string, unknown> = { gross_kg: gross, tare_kg: tare, status: 'weighed' };
      if (selectedItem && gateRequiresBagCount({ tracking_mode: (selectedItem.tracking_mode ?? 'WEIGHT_ONLY') as TrackingMode, gate_bag_count_required: selectedItem.gate_bag_count_required })) {
        const bags = Number(form.observed_bag_count);
        if (!Number.isInteger(bags) || bags <= 0) {
          setError('Bag count is required for this item.');
          setSaving(false);
          return;
        }
        patch.observed_bag_count = bags;
      }
      await api(`/api/gate/${created.id}`, json('PATCH', patch));
      setForm(blankGateForm());
      setSaudaQuery('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save gate entry');
    } finally {
      setSaving(false);
    }
  }

  async function saveEntry(entry: GateEntry) {
    const editForm = drafts[entry.id] ?? editFormFromEntry(entry);
    const body: Record<string, unknown> = { status: editForm.status };
    if (entry.status !== 'done') {
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
    if (editForm.observed_bag_count !== '') {
      const bags = Number(editForm.observed_bag_count);
      if (!Number.isInteger(bags) || bags <= 0) return setError('Bag count must be a positive whole number.');
      body.observed_bag_count = bags;
    }

    setSavingEntryId(entry.id);
    setError(null);
    try {
      await api(`/api/gate/${entry.id}`, json('PATCH', body));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update gate entry');
    } finally {
      setSavingEntryId(null);
    }
  }

  function itemForEntry(entry: GateEntry) {
    return items.find((item) => item.id === entry.item_id) ?? null;
  }

  function draftNetKg(entry: GateEntry) {
    const draft = drafts[entry.id];
    if (!draft) return entry.net_kg ?? 0;
    const gross = draft.gross_kg === '' ? null : wholeKg(draft.gross_kg);
    const tare = draft.tare_kg === '' ? null : wholeKg(draft.tare_kg);
    if (gross == null || tare == null) return entry.net_kg ?? 0;
    return Math.max(0, gross - tare);
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
          actions={
            <TableEditModeButton
              enabled={canEdit}
              editMode={tableEdit.editMode}
              onToggle={tableEdit.toggleEditMode}
            />
          }
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        <TabRow className="screen-section-tabs" aria-label="Gate workspace">
          <Tab selected={screen === 'weighbridge'} onClick={() => setScreen('weighbridge')}>Weighbridge</Tab>
          {canViewGunny ? <Tab selected={screen === 'gunny'} onClick={() => setScreen('gunny')}>Gunny bags</Tab> : null}
        </TabRow>

        {screen === 'gunny' && canViewGunny ? (
          gunny ? (
            <GunnyBagsPanel
              data={gunny}
              canCreate={canCreate}
              onSaved={loadGunny}
              compactIntro
            />
          ) : (
            <p className="muted">Loading gunny bag data…</p>
          )
        ) : null}

        {screen === 'weighbridge' ? (
        <>
        {canCreate && (
          <Panel title="Add New gate entry">
            <FormGrid onSubmit={submit}>
              <Field label="Sauda">
                <Select
                  required
                  value={form.sauda_id}
                  onChange={(e) => applySauda(e.target.value)}
                  searchable
                  searchValue={saudaQuery}
                  onSearchChange={setSaudaQuery}
                  searchPlaceholder="Search by code, party, or item…"
                  emptyMessage={saudaQuery.trim() ? 'No saudas match this search' : 'No open saudas'}
                >
                  <option value="">Select sauda</option>
                  {filteredEligibleSaudas.map((sauda) => (
                    <option key={sauda.id} value={sauda.id}>{formatSaudaCode(sauda.code, sauda.direction)}</option>
                  ))}
                </Select>
              </Field>

              {selectedSauda ? (
                <div className="gate-sauda-summary">
                  <dl className="gate-sauda-summary-grid">
                    <div><dt>Sauda</dt><dd>{formatSaudaCode(selectedSauda.code, selectedSauda.direction)}</dd></div>
                    <div><dt>Direction</dt><dd>{selectedSauda.direction === 'out' ? 'Sale' : 'Purchase'}</dd></div>
                    <div><dt>Party</dt><dd>{selectedSauda.direction === 'out' ? selectedSauda.buyer_name : selectedSauda.supplier_name ?? '—'}</dd></div>
                    <div><dt>Item</dt><dd>{selectedSauda.item_name ?? '—'}</dd></div>
                    <div><dt>Agreed</dt><dd>{qtl(selectedSauda.qty_kg)}</dd></div>
                    <div><dt>Delivered</dt><dd>{qtl(selectedSauda.fulfilled_qty_base)}</dd></div>
                    <div><dt>Remaining</dt><dd>{qtl(saudaRemainingKg(selectedSauda))}</dd></div>
                    <div><dt>Status</dt><dd>{selectedSauda.fulfilment_status ?? selectedSauda.status ?? '—'}</dd></div>
                    {formNetKg != null ? (
                      <div><dt>This truck</dt><dd>{formNetKg.toLocaleString('en-IN')} kg · {qtl(formNetKg)}</dd></div>
                    ) : null}
                  </dl>
                  <SaudaTruckTable trucks={linkedTrucks} />
                </div>
              ) : null}

              <div className="gate-weigh-fields">
                <Field label="Vehicle">
                  <Input
                    required
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={VEHICLE_NUMBER_MAX_LENGTH}
                    placeholder={VEHICLE_NUMBER_PLACEHOLDER}
                    value={form.vehicle_no}
                    onChange={(e) => setForm({ ...form, vehicle_no: sanitizeVehicleNumber(e.target.value) })}
                  />
                </Field>
                <Field label="Gross kg">
                  <Input required inputMode="numeric" value={form.gross_kg} onChange={(e) => setForm({ ...form, gross_kg: e.target.value })} />
                </Field>
                <Field label="Tare kg">
                  <Input required inputMode="numeric" value={form.tare_kg} onChange={(e) => setForm({ ...form, tare_kg: e.target.value })} />
                </Field>
                {selectedItem && gateRequiresBagCount({ tracking_mode: (selectedItem.tracking_mode ?? 'WEIGHT_ONLY') as TrackingMode, gate_bag_count_required: selectedItem.gate_bag_count_required }) ? (
                  <Field label="Bags">
                    <Input required inputMode="numeric" value={form.observed_bag_count} onChange={(e) => setForm({ ...form, observed_bag_count: e.target.value })} />
                  </Field>
                ) : null}
              </div>

              {(() => {
                if (!selectedItem || !gateRequiresBagCount({ tracking_mode: (selectedItem.tracking_mode ?? 'WEIGHT_ONLY') as TrackingMode, gate_bag_count_required: selectedItem.gate_bag_count_required })) return null;
                const net = formNetKg;
                const bags = form.observed_bag_count === '' ? null : Number(form.observed_bag_count);
                const average = net != null && bags != null && Number.isInteger(bags) && bags > 0 ? deriveAverageKgPerBag(net, bags) : null;
                if (net == null || average == null) return null;
                return (
                  <Field label="Receipt summary">
                    <p className="muted">Net material: {net.toLocaleString('en-IN')} kg / {(net / 100).toFixed(2)} qtl · Average filled bag: {average.toFixed(2)} kg</p>
                  </Field>
                );
              })()}

              <div className="form-actions">
                <Button type="submit" disabled={saving || !form.sauda_id}>{saving ? 'Saving…' : 'Save weighment'}</Button>
              </div>
            </FormGrid>
          </Panel>
        )}

        <TableCard
          className={editing ? 'gate-table-editing' : ''}
          title="Gate entries"
          subtitle={
            editing
              ? 'Update weights, moisture, and status inline. Mark arriving trucks Done to send them to Stock.'
              : `${visible.length} entr${visible.length === 1 ? 'y' : 'ies'}`
          }
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
          <DataTable columns={columns}>
            {visible.length ? visible.map((entry) => {
              const draft = drafts[entry.id] ?? editFormFromEntry(entry);
              const rowSaving = savingEntryId === entry.id;
              const weightsLocked = entry.status === 'done';
              return (
                <tr key={entry.id} className={rowSaving ? 'table-row-saving' : undefined}>
                  <td><strong>{formatVehicleNumber(entry.vehicle_no)}</strong></td>
                  <td>{entry.direction === 'in' ? 'Arriving' : 'Dispatching'}</td>
                  <td>{entrySaudaLabel(entry)}</td>
                  <td>{entry.direction === 'in' ? entry.supplier_name ?? '—' : entry.buyer_name ?? '—'}</td>
                  <td>{entry.item_name ?? '—'}</td>
                  {editing ? (
                    <>
                      <td className="table-inline-cell">
                        {weightsLocked ? (
                          <span className="muted">{entry.gross_kg ?? '—'}</span>
                        ) : (
                          <Input
                            inputMode="numeric"
                            className="table-inline-input"
                            aria-label={`Gross kg for ${formatVehicleNumber(entry.vehicle_no)}`}
                            value={draft.gross_kg}
                            disabled={rowSaving}
                            onChange={(event) => updateDraft(entry.id, { gross_kg: event.target.value })}
                          />
                        )}
                      </td>
                      <td className="table-inline-cell">
                        {weightsLocked ? (
                          <span className="muted">{entry.tare_kg ?? '—'}</span>
                        ) : (
                          <Input
                            inputMode="numeric"
                            className="table-inline-input"
                            aria-label={`Tare kg for ${formatVehicleNumber(entry.vehicle_no)}`}
                            value={draft.tare_kg}
                            disabled={rowSaving}
                            onChange={(event) => updateDraft(entry.id, { tare_kg: event.target.value })}
                          />
                        )}
                      </td>
                      <td>
                        <strong>{qtl(draftNetKg(entry))}</strong>
                        {(() => {
                          const item = itemForEntry(entry);
                          if (!item || !itemUsesVariableBags(item.tracking_mode)) return null;
                          const bags = draft.observed_bag_count === '' ? null : Number(draft.observed_bag_count);
                          const average = deriveAverageKgPerBag(draftNetKg(entry), Number.isInteger(bags) ? bags : null);
                          return average != null ? <small className="muted">Avg {average.toFixed(2)} kg/bag</small> : null;
                        })()}
                      </td>
                      {(() => {
                        const item = itemForEntry(entry);
                        if (!item || !gateRequiresBagCount({ tracking_mode: (item.tracking_mode ?? 'WEIGHT_ONLY') as TrackingMode, gate_bag_count_required: item.gate_bag_count_required })) return null;
                        return (
                          <td className="table-inline-cell">
                            <Input
                              inputMode="numeric"
                              className="table-inline-input"
                              aria-label={`Bags for ${formatVehicleNumber(entry.vehicle_no)}`}
                              value={draft.observed_bag_count}
                              disabled={rowSaving}
                              onChange={(event) => updateDraft(entry.id, { observed_bag_count: event.target.value })}
                            />
                          </td>
                        );
                      })()}
                      <td className="table-inline-cell">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="table-inline-input"
                          aria-label={`Moisture for ${formatVehicleNumber(entry.vehicle_no)}`}
                          value={draft.moisture_pct}
                          disabled={rowSaving}
                          onChange={(event) => updateDraft(entry.id, { moisture_pct: event.target.value })}
                        />
                      </td>
                      <td className="table-inline-cell">
                        <Select
                          {...TABLE_SELECT_PROPS}
                          aria-label={`Status for ${formatVehicleNumber(entry.vehicle_no)}`}
                          value={draft.status}
                          disabled={rowSaving}
                          onChange={(event) => updateDraft(entry.id, { status: event.target.value })}
                        >
                          {GATE_STATUSES.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="table-inline-cell table-inline-actions">
                        <Button
                          type="button"
                          className="quiet"
                          disabled={rowSaving}
                          onClick={() => void saveEntry(entry)}
                        >
                          {rowSaving ? 'Saving…' : 'Save'}
                        </Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <strong>{qtl(entry.net_kg)}</strong>
                        {entry.observed_bag_count != null ? (
                          <small className="muted">
                            {entry.observed_bag_count} bags
                            {deriveAverageKgPerBag(entry.net_kg ?? 0, entry.observed_bag_count) != null
                              ? ` · avg ${deriveAverageKgPerBag(entry.net_kg ?? 0, entry.observed_bag_count)!.toFixed(2)} kg`
                              : ''}
                          </small>
                        ) : itemForEntry(entry) && itemUsesVariableBags(itemForEntry(entry)?.tracking_mode)
                          ? <small className="muted">Bag count was not recorded</small>
                          : null}
                      </td>
                      <td><Badge tone={entry.status === 'done' ? 'success' : 'warning'}>{statusLabel(entry.status)}</Badge></td>
                    </>
                  )}
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={columns.length}><EmptyState>No gate entries in this view.</EmptyState></td>
              </tr>
            )}
          </DataTable>
        </TableCard>
        </>
        ) : null}
      </section>
    </main>
  );
}
