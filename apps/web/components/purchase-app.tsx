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
  FormActions,
  FormGrid,
  Input,
  FilterSearch,
  PageHeader,
  Panel,
  RangeField,
  Select,
  TableActions,
  TableCard,
  TableFilters,
  TablePager,
  Textarea,
} from './ui';
import { filterRows, paginate, PAGE_SIZE, uniqueValues } from '../lib/list-view';
import { millHeaderMeta } from '../lib/app-meta';
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

const SAUDA_COLUMNS = [
  { id: 'code', label: 'Code' },
  { id: 'type', label: 'Type' },
  { id: 'party', label: 'Party' },
  { id: 'material', label: 'Material' },
  { id: 'agreed', label: 'Agreed' },
  { id: 'fulfilled', label: 'Fulfilled' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '' },
];

export function PurchaseApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [agreement, setAgreement] = useState(blankAgreement);
  const [delivery, setDelivery] = useState(blankDelivery);
  const [deliveryFor, setDeliveryFor] = useState<Sauda | null>(null);
  const [historyFor, setHistoryFor] = useState<Sauda | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => setOverview(await api<Overview>('/api/overview'));
  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load Saudās'));
  }, [session]);

  const saudas = overview?.saudas ?? [];

  const filteredSaudas = useMemo(
    () => filterRows(saudas, query, filters, {
      quantityKg: (sauda) => sauda.qty_kg,
      match: (sauda, activeFilters) => (
        (!activeFilters.direction || activeFilters.direction === sauda.direction)
        && (!activeFilters.status || activeFilters.status === String(sauda.status ?? '').toLowerCase())
        && (!activeFilters.item_name || activeFilters.item_name === sauda.item_name)
      ),
    }),
    [saudas, query, filters],
  );

  const pageData = useMemo(() => paginate(filteredSaudas, page), [filteredSaudas, page]);
  const itemOptions = useMemo(() => uniqueValues(saudas, (sauda) => sauda.item_name), [saudas]);
  const statusOptions = useMemo(() => uniqueValues(saudas, (sauda) => String(sauda.status ?? '').toLowerCase()), [saudas]);

  useEffect(() => {
    setPage(0);
  }, [query, filters]);
  const canManage = session != null && ['owner', 'admin', 'accountant'].includes(session.role);
  const parties = agreement.direction === 'in' ? overview?.suppliers ?? [] : overview?.buyers ?? [];

  async function createAgreement(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(agreement.quantity);
    const ratePaise = Math.round(Number(agreement.rate) * 100);
    if (!agreement.party_id || !agreement.item_id || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(ratePaise) || ratePaise < 0) {
      setError('Choose a party and item, then enter a positive quantity and a valid rate.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api('/api/saudas', json('POST', {
        direction: agreement.direction,
        ...(agreement.direction === 'in' ? { supplier_id: agreement.party_id } : { buyer_id: agreement.party_id }),
        item_id: agreement.item_id,
        quantity,
        unit: agreement.unit,
        rate_paise_per_qtl: ratePaise,
        agreement_date: agreement.agreement_date,
        delivery_start: agreement.delivery_start || null,
        delivery_end: agreement.delivery_end || null,
        delivery_tolerance_pct: Number(agreement.tolerance),
        broker_name: agreement.broker.trim() || 'Direct',
        note: agreement.note.trim() || null,
      }));
      setAgreement(blankAgreement());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create Sauda');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(sauda: Sauda, status: string) {
    try {
      setError(null);
      await api(`/api/saudas/${sauda.id}`, json('PATCH', { status }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update Sauda');
    }
  }

  async function addDelivery(event: FormEvent) {
    event.preventDefault();
    if (!deliveryFor) return;
    const quantity = Number(delivery.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a positive delivery quantity.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ warning?: boolean }>(`/api/saudas/${deliveryFor.id}/deliveries`, json('POST', {
        actual_qty: quantity,
        actual_unit: delivery.unit,
        actual_date: delivery.actual_date,
        godown_id: delivery.godown_id || null,
        notes: delivery.notes.trim() || null,
      }));
      setDeliveryFor(null);
      setDelivery(blankDelivery());
      await load();
      if (result.warning) setError('Delivery was saved, but it exceeds this agreement’s configured tolerance.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save delivery');
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(sauda: Sauda) {
    try {
      setError(null);
      setHistoryFor(sauda);
      setDeliveries((await api<{ deliveries: Delivery[] }>(`/api/saudas/${sauda.id}/deliveries`)).deliveries);
    } catch (cause) {
      setHistoryFor(null);
      setError(cause instanceof Error ? cause.message : 'Could not load delivery history');
    }
  }

  async function voidDelivery(entry: Delivery) {
    const reason = window.prompt('Reason for voiding this manual delivery (at least 3 characters)');
    if (!reason) return;
    try {
      setError(null);
      await api(`/api/sauda-deliveries/${entry.id}/void`, json('POST', { reason }));
      if (historyFor) await openHistory(historyFor);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not void delivery');
    }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading Saudās…</p></main>;
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
          title="Saudās"
          subtitle="Purchase and sales agreements, fulfilment, and settlement status."
          date={headerMeta.date}
          season={headerMeta.season}
          actions={<AppLink href="/app/gate"><Button className="quiet">Open Gate</Button></AppLink>}
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        {canManage && (
          <Panel title="Add New agreement">
            <FormGrid onSubmit={createAgreement}>
              <Field label="Type">
                <Select value={agreement.direction} onChange={(e) => setAgreement({ ...agreement, direction: e.target.value as 'in' | 'out', party_id: '' })}>
                  <option value="in">Purchase / arriving</option>
                  <option value="out">Sale / dispatch</option>
                </Select>
              </Field>
              <Field label={agreement.direction === 'in' ? 'Supplier' : 'Buyer'}>
                <Select required value={agreement.party_id} onChange={(e) => setAgreement({ ...agreement, party_id: e.target.value })}>
                  <option value="">Select</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Item">
                <Select required value={agreement.item_id} onChange={(e) => setAgreement({ ...agreement, item_id: e.target.value })}>
                  <option value="">Select</option>
                  {(overview?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
              <Field label="Quantity">
                <Input required type="number" min="0.001" step="0.001" value={agreement.quantity} onChange={(e) => setAgreement({ ...agreement, quantity: e.target.value })} />
              </Field>
              <Field label="Unit">
                <Select value={agreement.unit} onChange={(e) => setAgreement({ ...agreement, unit: e.target.value })}>
                  <option>KG</option>
                  <option>QUINTAL</option>
                  <option>TONNE</option>
                </Select>
              </Field>
              <Field label="Rate ₹ / qtl">
                <Input required type="number" min="0" step="0.01" value={agreement.rate} onChange={(e) => setAgreement({ ...agreement, rate: e.target.value })} />
              </Field>
              <Field label="Agreement date">
                <Input required type="date" value={agreement.agreement_date} onChange={(e) => setAgreement({ ...agreement, agreement_date: e.target.value })} />
              </Field>
              <Field label="Delivery starts">
                <Input type="date" value={agreement.delivery_start} onChange={(e) => setAgreement({ ...agreement, delivery_start: e.target.value })} />
              </Field>
              <Field label="Delivery ends">
                <Input type="date" value={agreement.delivery_end} onChange={(e) => setAgreement({ ...agreement, delivery_end: e.target.value })} />
              </Field>
              <Field label="Tolerance %">
                <Input type="number" min="0" max="100" step="0.1" value={agreement.tolerance} onChange={(e) => setAgreement({ ...agreement, tolerance: e.target.value })} />
              </Field>
              <Field label="Broker">
                <Input value={agreement.broker} onChange={(e) => setAgreement({ ...agreement, broker: e.target.value })} />
              </Field>
              <Field label="Terms">
                <Textarea value={agreement.note} onChange={(e) => setAgreement({ ...agreement, note: e.target.value })} />
              </Field>
              <FormActions>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create agreement'}</Button>
              </FormActions>
            </FormGrid>
          </Panel>
        )}

        {deliveryFor && (
          <Panel title={`Manual delivery · ${deliveryFor.code ?? 'Agreement'}`}>
            <FormGrid onSubmit={addDelivery}>
              <Field label="Quantity">
                <Input required type="number" min="0.001" step="0.001" value={delivery.quantity} onChange={(e) => setDelivery({ ...delivery, quantity: e.target.value })} />
              </Field>
              <Field label="Unit">
                <Select value={delivery.unit} onChange={(e) => setDelivery({ ...delivery, unit: e.target.value })}>
                  <option>KG</option>
                  <option>QUINTAL</option>
                  <option>TONNE</option>
                </Select>
              </Field>
              <Field label="Date">
                <Input required type="date" value={delivery.actual_date} onChange={(e) => setDelivery({ ...delivery, actual_date: e.target.value })} />
              </Field>
              <Field label="Godown">
                <Select value={delivery.godown_id} onChange={(e) => setDelivery({ ...delivery, godown_id: e.target.value })}>
                  <option value="">Not specified</option>
                  {(overview?.godowns ?? []).map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}
                </Select>
              </Field>
              <Field label="Notes">
                <Textarea value={delivery.notes} onChange={(e) => setDelivery({ ...delivery, notes: e.target.value })} />
              </Field>
              <FormActions>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save delivery'}</Button>
                <Button className="secondary" type="button" onClick={() => setDeliveryFor(null)}>Cancel</Button>
              </FormActions>
            </FormGrid>
          </Panel>
        )}

        {historyFor && (
          <Panel
            title={`Delivery history · ${historyFor.code ?? 'Agreement'}`}
            actions={<Button className="secondary" type="button" onClick={() => setHistoryFor(null)}>Close</Button>}
          >
            {deliveries.length ? deliveries.map((entry) => (
              <div className="line" key={entry.id}>
                <span>
                  {entry.actual_date ?? '—'} · {qtl(entry.actual_qty_base)}
                  {entry.lot_code ? ` · ${entry.lot_code}` : ''}
                  {entry.gate_entry_id ? ' · Gate-linked' : ''}
                </span>
                <TableActions>
                  <Badge tone={entry.status === 'POSTED' ? 'success' : 'neutral'}>{entry.status ?? 'POSTED'}</Badge>
                  {canManage && entry.status === 'POSTED' && !entry.gate_entry_id && (
                    <Button type="button" className="secondary" onClick={() => void voidDelivery(entry)}>Void</Button>
                  )}
                </TableActions>
              </div>
            )) : <EmptyState>No deliveries recorded.</EmptyState>}
          </Panel>
        )}

        <TableCard title="Saudās & purchases" subtitle={`${filteredSaudas.length} agreement${filteredSaudas.length === 1 ? '' : 's'}`}>
          <TableFilters
            title="saudas"
            onClear={() => { setQuery(''); setFilters({}); }}
            clearDisabled={!query && !Object.keys(filters).length}
          >
            <FilterSearch value={query} onChange={setQuery} placeholder="Search saudas…" aria-label="Search saudas" />
            <Select className="table-filter" aria-label="Filter by direction" value={filters.direction ?? ''} onChange={(e) => setFilters({ ...filters, direction: e.target.value })}>
              <option value="">All directions</option>
              <option value="in">Purchases</option>
              <option value="out">Sales</option>
            </Select>
            <Select className="table-filter" aria-label="Filter by status" value={filters.status ?? ''} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Select className="table-filter" aria-label="Filter by material" value={filters.item_name ?? ''} onChange={(e) => setFilters({ ...filters, item_name: e.target.value })}>
              <option value="">All materials</option>
              {itemOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <RangeField
              label="Qty qtl"
              min={filters.min_qty ?? ''}
              max={filters.max_qty ?? ''}
              onMinChange={(value) => setFilters({ ...filters, min_qty: value })}
              onMaxChange={(value) => setFilters({ ...filters, max_qty: value })}
            />
          </TableFilters>

          <DataTable columns={SAUDA_COLUMNS}>
            {pageData.rows.length ? pageData.rows.map((sauda) => (
              <tr key={sauda.id}>
                <td><strong>{sauda.code ?? '—'}</strong></td>
                <td>{sauda.direction === 'out' ? 'Sale' : 'Purchase'}</td>
                <td>{sauda.direction === 'out' ? sauda.buyer_name ?? '—' : sauda.supplier_name ?? '—'}</td>
                <td>{sauda.item_name ?? '—'}</td>
                <td>{qtl(sauda.qty_kg)}</td>
                <td>{qtl(sauda.fulfilled_qty_base)}</td>
                <td><Badge tone="gold">{sauda.fulfilment_status ?? sauda.status ?? '—'}</Badge></td>
                <td>
                  <TableActions>
                    <Button type="button" className="secondary" onClick={() => void openHistory(sauda)}>History</Button>
                    {canManage && (
                      <>
                        <Button type="button" className="secondary" onClick={() => setDeliveryFor(sauda)}>Delivery</Button>
                        <Select aria-label={`Status for ${sauda.code ?? 'Sauda'}`} value={sauda.status ?? 'open'} onChange={(e) => void changeStatus(sauda, e.target.value)}>
                          <option value="open">Open</option>
                          <option value="advance_paid">Advance paid</option>
                          <option value="settled">Settled</option>
                          <option value="disputed">Disputed</option>
                        </Select>
                      </>
                    )}
                  </TableActions>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={SAUDA_COLUMNS.length}><EmptyState>No Saudās in this view.</EmptyState></td>
              </tr>
            )}
          </DataTable>

          <TablePager
            total={pageData.total}
            index={pageData.index}
            pageSize={PAGE_SIZE}
            onPrevious={() => setPage((current) => Math.max(0, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />
        </TableCard>

        {session.role !== 'manager' && (
          <p className="hint" style={{ marginTop: 12 }}>
            Rate visibility is server-controlled. Listed rate values, where permitted:{' '}
            {filteredSaudas.slice(0, 3).map((sauda) => `${sauda.code ?? 'Agreement'} ${money(sauda.rate_paise_per_qtl)}/qtl`).join(' · ') || '—'}
          </p>
        )}
      </section>
    </main>
  );
}
