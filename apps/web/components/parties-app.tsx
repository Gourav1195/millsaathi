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
  FilterSearch,
  FormActions,
  FormGrid,
  Input,
  PageHeader,
  Panel,
  RangeField,
  Select,
  TableCard,
  TableFilters,
  TablePager,
  Tab,
  TabRow,
} from './ui';
import {
  commitPartyImport,
  SpreadsheetImportButton,
  validatePartyImport,
} from './spreadsheet-import-button';
import {
  TableArchiveCell,
  TableEditCell,
  TableEditModeBar,
  TableEditModeButton,
  TableSelectAllBar,
} from './table-edit-mode';
import { millHeaderMeta } from '../lib/app-meta';
import { can, canViewFinance } from '../lib/permissions';
import { mapPartyImportRows } from '../lib/spreadsheet';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import { filterRows, paginate, PAGE_SIZE, uniqueValues } from '../lib/list-view';
import { balanceColumnLabel, brokerCommissionDuePaise, brokerSaudaCount, partyBalanceMeta, type SaudaBrokerRef } from '../lib/party-balance';
import { hasPartyDetails, partyDetailRows } from '../lib/row-details';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';
import { TableCellDetail } from './table-cell-detail';

type PartyTab = 'all' | 'buyers' | 'sellers' | 'brokers';
type PartyRole = 'buyer' | 'seller' | 'broker';
type SourceKind = 'buyer' | 'supplier';

type RawSupplier = {
  id: string;
  name: string;
  type?: string;
  phone?: string | null;
  place?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  outstanding_paise?: number;
  supplied_kg?: number;
  last_at?: string | null;
};

type RawBuyer = {
  id: string;
  name: string;
  type?: string;
  phone?: string | null;
  location?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  receivable_paise?: number;
  bought_kg?: number;
  last_at?: string | null;
};

type UnifiedParty = {
  id: string;
  name: string;
  role: PartyRole;
  sourceKind: SourceKind;
  subtype: string;
  phone?: string | null;
  city?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  balance_paise?: number;
  volume_kg?: number;
  broker_deals?: number;
  last_at?: string | null;
};

const qtl = (kg: number | undefined) => `${((kg ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} qtl`;

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

const ago = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const ROLE_LABEL: Record<PartyRole, string> = { buyer: 'Buyer', seller: 'Seller', broker: 'Broker' };

// Matches Worker validation in src/api.ts (suppliers.type / buyers.type).
const SELLER_TYPES = [
  { value: 'farmer', label: 'Farmer' },
  { value: 'trader', label: 'Trader' },
];

const BUYER_TYPES = ['Wholesaler', 'Distributor', 'Retailer', 'Exporter', 'Bran buyer', 'Husk buyer'];

function normalizeParties(suppliers: RawSupplier[], buyers: RawBuyer[], saudas: SaudaBrokerRef[]): UnifiedParty[] {
  const sellerParties = suppliers.map((party) => {
    const isBroker = String(party.type ?? 'farmer').toLowerCase() === 'broker';
    return {
      id: party.id,
      name: party.name,
      role: isBroker ? 'broker' as const : 'seller' as const,
      sourceKind: 'supplier' as const,
      subtype: party.type ?? (isBroker ? 'broker' : 'farmer'),
      phone: party.phone,
      city: party.place,
      email: party.email,
      gstin: party.gstin,
      address: party.address,
      balance_paise: isBroker ? brokerCommissionDuePaise(party.name, saudas) : party.outstanding_paise,
      volume_kg: isBroker ? undefined : party.supplied_kg,
      broker_deals: isBroker ? brokerSaudaCount(party.name, saudas) : undefined,
      last_at: party.last_at,
    };
  });
  const buyerParties = buyers.map((party) => ({
    id: party.id,
    name: party.name,
    role: 'buyer' as const,
    sourceKind: 'buyer' as const,
    subtype: party.type ?? 'Wholesaler',
    phone: party.phone,
    city: party.location,
    email: party.email,
    gstin: party.gstin,
    address: party.address,
    balance_paise: party.receivable_paise,
    volume_kg: party.bought_kg,
    last_at: party.last_at,
  }));
  return [...sellerParties, ...buyerParties].sort((a, b) => a.name.localeCompare(b.name));
}

export function PartiesApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [parties, setParties] = useState<UnifiedParty[]>([]);
  const [tab, setTab] = useState<PartyTab>('all');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    city: '',
    kind: 'seller' as 'buyer' | 'seller' | 'broker',
    sellerType: 'farmer',
    buyerType: 'Wholesaler',
  });
  const [editing, setEditing] = useState<UnifiedParty | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', city: '', sellerType: 'farmer', buyerType: 'Wholesaler' });
  const [saving, setSaving] = useState(false);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const tableEdit = useTableEditMode();

  const load = async () => {
    const body = await api<{ suppliers: RawSupplier[]; buyers: RawBuyer[]; saudas: SaudaBrokerRef[] }>('/api/overview');
    setParties(normalizeParties(body.suppliers, body.buyers, body.saudas ?? []));
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load parties'));
  }, [session]);

  useEffect(() => {
    setPage(0);
  }, [tab, query, filters]);

  useEffect(() => {
    tableEdit.exitEditMode();
  }, [tab]);

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

  const tabParties = useMemo(() => {
    if (tab === 'all') return parties;
    if (tab === 'buyers') return parties.filter((party) => party.role === 'buyer');
    if (tab === 'sellers') return parties.filter((party) => party.role === 'seller');
    return parties.filter((party) => party.role === 'broker');
  }, [parties, tab]);

  const filtered = useMemo(
    () => filterRows(tabParties, query, filters, {
      quantityKg: (party) => party.volume_kg,
      match: (party, activeFilters) => {
        const location = party.city ?? '';
        const subtype = party.subtype ?? '';
        return (!activeFilters.type || activeFilters.type === subtype)
          && (!activeFilters.location || activeFilters.location === location);
      },
    }),
    [tabParties, query, filters],
  );

  const pageData = useMemo(() => paginate(filtered, page), [filtered, page]);
  const typeOptions = useMemo(() => uniqueValues(tabParties, (party) => party.subtype), [tabParties]);
  const locationOptions = useMemo(() => uniqueValues(tabParties, (party) => party.city), [tabParties]);
  const restrictedMoney = !canViewFinance(session ?? { role: '' });
  const canEditParty = can(session, 'parties:edit');
  const canArchiveParty = can(session, 'parties:archive');
  const canImportParty = can(session, 'parties:create');
  const partyColumns = useMemo(() => withEditModeColumns([
    { id: 'name', label: 'Name' },
    { id: 'type', label: 'Type' },
    { id: 'location', label: 'Location' },
    { id: 'volume', label: tab === 'brokers' ? 'Linked saudas' : 'Season volume' },
    { id: 'balance', label: balanceColumnLabel(tab) },
    { id: 'last', label: 'Last' },
  ], tableEdit.editMode, { canEdit: canEditParty, canArchive: canArchiveParty }), [tab, tableEdit.editMode, canEditParty, canArchiveParty]);
  const importKind = tab === 'buyers' ? 'buyer' : 'supplier';

  const effectiveKind = tab === 'all' ? form.kind : tab === 'buyers' ? 'buyer' : tab === 'brokers' ? 'broker' : 'seller';
  const addTitle = tab === 'all'
    ? 'Add New Party'
    : effectiveKind === 'buyer'
      ? 'Add New buyer'
      : effectiveKind === 'broker'
        ? 'Add New broker'
        : 'Add New seller';
  const addButtonLabel = tab === 'all' ? 'Add New Party' : addTitle;
  const addPanelClass = `party-add-panel--${effectiveKind === 'buyer' ? 'buyer' : effectiveKind === 'broker' ? 'broker' : effectiveKind === 'seller' ? 'seller' : 'default'}`;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Party name is required.');

    try {
      if (effectiveKind === 'buyer') {
        await api('/api/buyers', json('POST', {
          name: form.name,
          phone: form.phone,
          location: form.city,
          type: form.buyerType,
        }));
      } else {
        await api('/api/suppliers', json('POST', {
          name: form.name,
          phone: form.phone,
          place: form.city,
          type: effectiveKind === 'broker' ? 'broker' : form.sellerType,
        }));
      }
      setForm({ name: '', phone: '', city: '', kind: effectiveKind === 'buyer' ? 'buyer' : effectiveKind === 'broker' ? 'broker' : 'seller', sellerType: 'farmer', buyerType: 'Wholesaler' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create party');
    }
  }

  function startEdit(party: UnifiedParty) {
    setEditing(party);
    setEditForm({
      name: party.name,
      phone: party.phone ?? '',
      city: party.city ?? '',
      sellerType: party.sourceKind === 'supplier' ? (party.subtype === 'broker' ? 'broker' : party.subtype) : 'farmer',
      buyerType: party.sourceKind === 'buyer' ? party.subtype : 'Wholesaler',
    });
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editForm.name.trim()) return setError('Party name is required.');
    setSaving(true);
    setError(null);
    try {
      const endpoint = editing.sourceKind === 'supplier' ? 'suppliers' : 'buyers';
      await api(`/api/${endpoint}/${editing.id}`, json('PATCH', editing.sourceKind === 'supplier'
        ? {
            name: editForm.name.trim(),
            phone: editForm.phone,
            place: editForm.city,
            type: editing.role === 'broker' ? 'broker' : editForm.sellerType,
          }
        : {
            name: editForm.name.trim(),
            phone: editForm.phone,
            location: editForm.city,
            type: editForm.buyerType,
          }));
      setEditing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update party');
    } finally {
      setSaving(false);
    }
  }

  async function bulkArchiveParties() {
    if (!tableEdit.selectedIds.length) return;
    const selectedParties = parties.filter((party) => tableEdit.selected[party.id]);
    if (!window.confirm(`Archive ${selectedParties.length} selected part${selectedParties.length === 1 ? 'y' : 'ies'}? They will be hidden from active lists.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const party of selectedParties) {
        const endpoint = party.sourceKind === 'supplier' ? 'suppliers' : 'buyers';
        await api(`/api/${endpoint}/${party.id}`, json('DELETE', {}));
      }
      tableEdit.exitEditMode();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive selected parties');
    } finally {
      setSaving(false);
    }
  }

  function clearFilters() {
    setQuery('');
    setFilters({});
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading parties…</p></main>;
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
          title="Parties"
          subtitle="Buyers, sellers, and brokers in one directory."
          date={headerMeta.date}
          season={headerMeta.season}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="hint">{filtered.length} part{filtered.length === 1 ? 'y' : 'ies'}</span>
              <TableEditModeButton
                enabled={canEditParty || canArchiveParty}
                editMode={tableEdit.editMode}
                onToggle={tableEdit.toggleEditMode}
              />
              <AppLink href="/app/purchase"><Button className="quiet">Open Saudās</Button></AppLink>
            </div>
          }
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        <div className="party-toolbar">
          <TabRow role="tablist" aria-label="Party groups">
            <Tab selected={tab === 'all'} onClick={() => setTab('all')}>All Parties</Tab>
            <Tab selected={tab === 'buyers'} onClick={() => setTab('buyers')}>Buyers</Tab>
            <Tab selected={tab === 'sellers'} onClick={() => setTab('sellers')}>Sellers</Tab>
            <Tab selected={tab === 'brokers'} onClick={() => setTab('brokers')}>Brokers</Tab>
          </TabRow>
          {!showAdd && (
            <Button type="button" className="party-add-btn" onClick={() => setShowAdd(true)}>
              + {addButtonLabel}
              {tab === 'all' ? <span className="party-add-btn-chevron" aria-hidden="true">▾</span> : null}
            </Button>
          )}
        </div>

        {showAdd && (
          <Panel
            title={addTitle}
            className={`party-add-panel ${addPanelClass}`}
            actions={
              <Button type="button" className="secondary" onClick={() => setShowAdd(false)} aria-label={`Close ${addTitle}`}>
                Close
              </Button>
            }
          >
            <FormGrid onSubmit={create}>
              <Field label="Name">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              {tab === 'all' && (
                <Field label="Party kind">
                  <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'buyer' | 'seller' | 'broker' })}>
                    <option value="buyer">Buyer</option>
                    <option value="seller">Seller</option>
                    <option value="broker">Broker</option>
                  </Select>
                </Field>
              )}
              {effectiveKind === 'seller' && (
                <Field label="Seller type">
                  <Select value={form.sellerType} onChange={(e) => setForm({ ...form, sellerType: e.target.value })}>
                    {SELLER_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              )}
              {effectiveKind === 'buyer' && (
                <Field label="Buyer type">
                  <Select value={form.buyerType} onChange={(e) => setForm({ ...form, buyerType: e.target.value })}>
                    {BUYER_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="City / village">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <FormActions>
                <Button type="submit">Save party</Button>
              </FormActions>
            </FormGrid>
          </Panel>
        )}

        <dialog
          ref={editDialogRef}
          className="app-dialog"
          onClose={() => {
            if (!saving) setEditing(null);
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeEdit();
          }}
        >
          {editing ? (
            <>
              <div className="app-dialog-head">
                <div>
                  <h2>Edit {ROLE_LABEL[editing.role].toLowerCase()}</h2>
                  <p><strong>{editing.name}</strong></p>
                </div>
                <button
                  type="button"
                  className="app-dialog-close ms-focus-ring"
                  aria-label="Close edit party dialog"
                  onClick={closeEdit}
                  disabled={saving}
                >
                  ×
                </button>
              </div>
              <FormGrid className="ui-form-grid--compact" onSubmit={saveEdit}>
                <Field label="Name">
                  <Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </Field>
                {editing.role === 'seller' && (
                  <Field label="Seller type">
                    <Select value={editForm.sellerType} onChange={(e) => setEditForm({ ...editForm, sellerType: e.target.value })}>
                      {SELLER_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </Field>
                )}
                {editing.role === 'buyer' && (
                  <Field label="Buyer type">
                    <Select value={editForm.buyerType} onChange={(e) => setEditForm({ ...editForm, buyerType: e.target.value })}>
                      {BUYER_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Phone">
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </Field>
                <Field label="City / village">
                  <Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
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
          actions={canImportParty && tab !== 'brokers' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <SpreadsheetImportButton
                templateHref={`/api/parties/import/template.csv?kind=${importKind}`}
                maxRows={1000}
                mapRows={(rows) => mapPartyImportRows(importKind, rows)}
                validate={(rows) => validatePartyImport(importKind, rows)}
                commit={(rows) => commitPartyImport(importKind, rows)}
                onImported={load}
                onError={setError}
              />
            </div>
          ) : null}
        >
          <TableFilters
            compact
            onClear={clearFilters}
            clearDisabled={!query && !Object.keys(filters).length}
          >
            <FilterSearch value={query} onChange={setQuery} placeholder="Search parties…" aria-label="Search parties" />
            <Select
              className="table-filter"
              aria-label="Filter by type"
              value={filters.type ?? ''}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              <option value="">All types</option>
              {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Select
              className="table-filter"
              aria-label="Filter by location"
              value={filters.location ?? ''}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
            >
              <option value="">All locations</option>
              {locationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <RangeField
              label="Qty qtl"
              min={filters.min_qty ?? ''}
              max={filters.max_qty ?? ''}
              onMinChange={(value) => setFilters({ ...filters, min_qty: value })}
              onMaxChange={(value) => setFilters({ ...filters, max_qty: value })}
            />
          </TableFilters>

          <TableEditModeBar
            visible={tableEdit.editMode && canArchiveParty}
            selectedCount={tableEdit.selectedIds.length}
            onArchive={() => void bulkArchiveParties()}
            archiving={saving}
          />

          <DataTable columns={partyColumns}>
            {pageData.rows.length ? pageData.rows.map((party) => {
              const balance = partyBalanceMeta(party.role, party.balance_paise, restrictedMoney);
              return (
              <tr key={`${party.sourceKind}-${party.id}`} className={`party-row--${party.role}`}>
                {tableEdit.editMode && canArchiveParty && (
                  <TableArchiveCell
                    label={party.name}
                    checked={!!tableEdit.selected[party.id]}
                    onChange={(checked) => tableEdit.toggleSelected(party.id, checked)}
                  />
                )}
                {tableEdit.editMode && canEditParty && (
                  <TableEditCell label={party.name} onClick={() => startEdit(party)} />
                )}
                <td>
                  {hasPartyDetails(party) ? (
                    <TableCellDetail
                      title={`${party.name} details`}
                      rows={partyDetailRows(party)}
                      className="party-name-cell"
                    >
                      <span className={`party-avatar party-avatar--${party.role}`} aria-hidden="true">{initials(party.name)}</span>
                      <strong>{party.name}</strong>
                    </TableCellDetail>
                  ) : (
                    <div className="party-name-cell">
                      <span className={`party-avatar party-avatar--${party.role}`} aria-hidden="true">{initials(party.name)}</span>
                      <strong>{party.name}</strong>
                    </div>
                  )}
                </td>
                <td>
                  <Badge tone={party.role === 'buyer' ? 'success' : party.role === 'broker' ? 'gold' : 'neutral'}>
                    {ROLE_LABEL[party.role]} · {party.subtype}
                  </Badge>
                </td>
                <td>{party.city ?? '—'}</td>
                <td>
                  <strong>
                    {party.role === 'broker'
                      ? (party.broker_deals ? `${party.broker_deals} sauda${party.broker_deals === 1 ? '' : 's'}` : '—')
                      : qtl(party.volume_kg)}
                  </strong>
                </td>
                <td>
                  <div className="party-balance-cell">
                    {tab === 'all' ? <span className="party-balance-label">{balance.label}</span> : null}
                    <strong style={{ color: balance.color }}>{balance.display}</strong>
                  </div>
                </td>
                <td className="muted">{ago(party.last_at)}</td>
              </tr>
              );
            }) : (
              <tr>
                <td colSpan={partyColumns.length}><EmptyState>No matching parties.</EmptyState></td>
              </tr>
            )}
          </DataTable>

          <TableSelectAllBar
            visible={tableEdit.editMode && canArchiveParty && pageData.rows.length > 0}
            checked={tableEdit.isPageFullySelected(pageData.rows.map((party) => party.id))}
            onChange={(checked) => tableEdit.togglePageSelected(pageData.rows.map((party) => party.id), checked)}
            label="Select all on this page"
          />

          <TablePager
            total={pageData.total}
            index={pageData.index}
            pageSize={PAGE_SIZE}
            onPrevious={() => setPage((current) => Math.max(0, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />
        </TableCard>
      </section>
    </main>
  );
}
