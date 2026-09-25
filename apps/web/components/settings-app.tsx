'use client';

import { AppLink } from './app-link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  Select,
  TableActions,
  TableCard,
  Tab,
  TabRow,
} from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { formatDate } from '../lib/format';
import { can, isOwnerRole } from '../lib/permissions';
import { PREFERRED_UNITS, useSession, type PreferredUnit } from '../lib/session';
import { api, json } from '../lib/api';
import type { Theme } from '../lib/theme';

type ArchivedParty = { id: string; name: string; type?: string | null; deleted_at?: string | null };
type ArchivedItem = { id: string; name: string; category?: string | null; deleted_at?: string | null };
type ArchivedGodown = { id: string; name: string; location?: string | null };
type ArchivedSauda = { id: string; code?: string | null; direction?: string | null; party_name?: string | null; item_name?: string | null; deleted_at?: string | null };
type ArchivedProcess = { id: string; name: string; deleted_at?: string | null };
type ArchivedData = {
  suppliers: ArchivedParty[];
  buyers: ArchivedParty[];
  items: ArchivedItem[];
  godowns: ArchivedGodown[];
  saudas: ArchivedSauda[];
  process_types: ArchivedProcess[];
  processing_chains: ArchivedProcess[];
};

type SettingsSection = 'general' | 'archived';
type ArchivedTab = 'parties' | 'items' | 'stock' | 'purchase' | 'processing';
type RestoreKind = 'supplier' | 'buyer' | 'item' | 'godown' | 'sauda' | 'process_type' | 'processing_chain';

const RESTORE_PATHS: Record<RestoreKind, (id: string) => string> = {
  supplier: (id) => `/api/suppliers/${id}/restore`,
  buyer: (id) => `/api/buyers/${id}/restore`,
  item: (id) => `/api/items/${id}/restore`,
  godown: (id) => `/api/godowns/${id}/restore`,
  sauda: (id) => `/api/saudas/${id}/restore`,
  process_type: (id) => `/api/process-types/${id}/restore`,
  processing_chain: (id) => `/api/processing-chains/${id}/restore`,
};

const PARTY_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'kind', label: 'Kind' },
  { id: 'type', label: 'Type' },
  { id: 'archived', label: 'Archived' },
  { id: 'actions', label: '' },
];

const ITEM_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'category', label: 'Category' },
  { id: 'archived', label: 'Archived' },
  { id: 'actions', label: '' },
];

const GODOWN_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'location', label: 'Location' },
  { id: 'actions', label: '' },
];

const SAUDA_COLUMNS = [
  { id: 'code', label: 'Code' },
  { id: 'party', label: 'Party' },
  { id: 'item', label: 'Item' },
  { id: 'direction', label: 'Direction' },
  { id: 'archived', label: 'Archived' },
  { id: 'actions', label: '' },
];

const PROCESS_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'kind', label: 'Kind' },
  { id: 'archived', label: 'Archived' },
  { id: 'actions', label: '' },
];

function archivedLabel(value?: string | null) {
  return value ? formatDate(value) : '—';
}

function preferredUnitLabel(unit: string) {
  if (unit === 'KG') return 'Kilogram (kg)';
  if (unit === 'TONNE') return 'Tonne';
  if (unit === 'BAG') return 'Bag';
  if (unit === 'PIECE') return 'Piece';
  return 'Quintal';
}

export function SettingsApp() {
  const { session, sessionError, updateTheme, updatePreferredUnit } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [section, setSection] = useState<SettingsSection>('general');
  const [tab, setTab] = useState<ArchivedTab>('parties');
  const [data, setData] = useState<ArchivedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingPreferredUnit, setSavingPreferredUnit] = useState(false);
  const theme = session?.theme ?? 'light';
  const preferredUnit = (session?.preferred_unit ?? 'QUINTAL') as PreferredUnit;

  const load = async () => {
    const body = await api<ArchivedData>('/api/archived');
    setData(body);
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load archived data'));
  }, [session]);

  const isOwner = isOwnerRole(session ?? { role: '' });
  const canRestore = can(session, 'settings:manage');

  const counts = useMemo(() => ({
    parties: (data?.suppliers.length ?? 0) + (data?.buyers.length ?? 0),
    items: data?.items.length ?? 0,
    stock: data?.godowns.length ?? 0,
    purchase: data?.saudas.length ?? 0,
    processing: (data?.process_types.length ?? 0) + (data?.processing_chains.length ?? 0),
  }), [data]);

  async function setTheme(nextTheme: Theme) {
    if (nextTheme === theme) return;
    setSavingTheme(true);
    setError(null);
    try {
      await updateTheme(nextTheme);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update theme');
    } finally {
      setSavingTheme(false);
    }
  }

  async function setPreferredUnit(nextUnit: PreferredUnit) {
    if (nextUnit === preferredUnit) return;
    setSavingPreferredUnit(true);
    setError(null);
    try {
      await updatePreferredUnit(nextUnit);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update preferred unit');
    } finally {
      setSavingPreferredUnit(false);
    }
  }

  async function restore(kind: RestoreKind, id: string, label: string) {
    if (!window.confirm(`Restore ${label}?`)) return;
    setRestoringId(id);
    setError(null);
    try {
      await api(RESTORE_PATHS[kind](id), json('PATCH', {}));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore record');
    } finally {
      setRestoringId(null);
    }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading settings…</p></main>;
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

  const partyRows = [
    ...(data?.suppliers ?? []).map((party) => ({ ...party, kind: 'Supplier' as const, restoreKind: 'supplier' as const })),
    ...(data?.buyers ?? []).map((party) => ({ ...party, kind: 'Buyer' as const, restoreKind: 'buyer' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const processingRows = [
    ...(data?.process_types ?? []).map((entry) => ({ ...entry, kind: 'Process type' as const, restoreKind: 'process_type' as const })),
    ...(data?.processing_chains ?? []).map((entry) => ({ ...entry, kind: 'Processing chain' as const, restoreKind: 'processing_chain' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <PageHeader
          title="Settings"
          subtitle="Mill preferences and archived records."
          date={headerMeta.date}
          season={headerMeta.season}
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        <TabRow className="screen-section-tabs">
          <Tab selected={section === 'general'} onClick={() => setSection('general')}>General</Tab>
          <Tab selected={section === 'archived'} onClick={() => setSection('archived')}>Archived data</Tab>
        </TabRow>

        {section === 'general' && (
          <>
            <Panel title="Preferred unit">
              <p className="muted" style={{ marginTop: 0 }}>
                Default unit for quantities across your mill. Processing, items, and stock screens use this as the starting unit.
              </p>
              {isOwner ? (
                <label style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
                  <span className="muted">Mill unit</span>
                  <Select
                    value={preferredUnit}
                    disabled={savingPreferredUnit}
                    aria-label="Preferred unit"
                    onChange={(event) => void setPreferredUnit(event.target.value as PreferredUnit)}
                  >
                    {PREFERRED_UNITS.map((unit) => (
                      <option key={unit} value={unit}>{preferredUnitLabel(unit)}</option>
                    ))}
                  </Select>
                </label>
              ) : (
                <p style={{ margin: 0 }}>
                  <strong>{preferredUnitLabel(preferredUnit)}</strong>
                  <span className="muted"> · Only the mill owner can change this.</span>
                </p>
              )}
            </Panel>

            <Panel title="Appearance">
              <p className="muted" style={{ marginTop: 0 }}>
                Choose how MillSaathi looks on this device. Your preference is saved to your account.
              </p>
              <TabRow aria-label="Color mode">
                <Tab selected={theme === 'light'} disabled={savingTheme} onClick={() => void setTheme('light')}>Light</Tab>
                <Tab selected={theme === 'dark'} disabled={savingTheme} onClick={() => void setTheme('dark')}>Dark</Tab>
              </TabRow>
            </Panel>
          </>
        )}

        {section === 'archived' && (
        <Panel title="Archived data">
          <p className="muted" style={{ marginTop: 0 }}>
            Records archived from Parties, Items, Stock, Purchase, and Processing appear here. Restoring brings them back to their original screens.
          </p>

          <TabRow>
            <Tab selected={tab === 'parties'} onClick={() => setTab('parties')}>Parties ({counts.parties})</Tab>
            <Tab selected={tab === 'items'} onClick={() => setTab('items')}>Items ({counts.items})</Tab>
            <Tab selected={tab === 'stock'} onClick={() => setTab('stock')}>Stock ({counts.stock})</Tab>
            {isOwner ? <Tab selected={tab === 'purchase'} onClick={() => setTab('purchase')}>Purchase ({counts.purchase})</Tab> : null}
            <Tab selected={tab === 'processing'} onClick={() => setTab('processing')}>Processing ({counts.processing})</Tab>
          </TabRow>

          {tab === 'parties' && (
            <TableCard title="Archived parties" subtitle={`${partyRows.length} archived`}>
              <DataTable columns={PARTY_COLUMNS}>
                {partyRows.length ? partyRows.map((party) => (
                  <tr key={`${party.restoreKind}-${party.id}`}>
                    <td><strong>{party.name}</strong></td>
                    <td>{party.kind}</td>
                    <td>{party.type ?? '—'}</td>
                    <td>{archivedLabel(party.deleted_at)}</td>
                    <td>
                      <TableActions>
                        {canRestore ? (
                          <Button type="button" disabled={restoringId === party.id} onClick={() => void restore(party.restoreKind, party.id, party.name)}>
                            {restoringId === party.id ? 'Restoring…' : 'Restore'}
                          </Button>
                        ) : null}
                      </TableActions>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={PARTY_COLUMNS.length}><EmptyState>No archived parties.</EmptyState></td></tr>
                )}
              </DataTable>
            </TableCard>
          )}

          {tab === 'items' && (
            <TableCard title="Archived items" subtitle={`${data?.items.length ?? 0} archived`}>
              <DataTable columns={ITEM_COLUMNS}>
                {(data?.items.length ?? 0) ? data!.items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.category ?? '—'}</td>
                    <td>{archivedLabel(item.deleted_at)}</td>
                    <td>
                      <TableActions>
                        {canRestore ? (
                          <Button type="button" disabled={restoringId === item.id} onClick={() => void restore('item', item.id, item.name)}>
                            {restoringId === item.id ? 'Restoring…' : 'Restore'}
                          </Button>
                        ) : null}
                      </TableActions>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={ITEM_COLUMNS.length}><EmptyState>No archived items.</EmptyState></td></tr>
                )}
              </DataTable>
            </TableCard>
          )}

          {tab === 'stock' && (
            <TableCard title="Archived godowns" subtitle={`${data?.godowns.length ?? 0} archived`}>
              <DataTable columns={GODOWN_COLUMNS}>
                {(data?.godowns.length ?? 0) ? data!.godowns.map((godown) => (
                  <tr key={godown.id}>
                    <td><strong>{godown.name}</strong></td>
                    <td>{godown.location ?? '—'}</td>
                    <td>
                      <TableActions>
                        {canRestore ? (
                          <Button type="button" disabled={restoringId === godown.id} onClick={() => void restore('godown', godown.id, godown.name)}>
                            {restoringId === godown.id ? 'Restoring…' : 'Restore'}
                          </Button>
                        ) : null}
                      </TableActions>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={GODOWN_COLUMNS.length}><EmptyState>No archived godowns.</EmptyState></td></tr>
                )}
              </DataTable>
            </TableCard>
          )}

          {tab === 'purchase' && isOwner && (
            <TableCard title="Archived saudas" subtitle={`${data?.saudas.length ?? 0} archived`}>
              <DataTable columns={SAUDA_COLUMNS}>
                {(data?.saudas.length ?? 0) ? data!.saudas.map((sauda) => (
                  <tr key={sauda.id}>
                    <td><strong>{sauda.code ?? sauda.id}</strong></td>
                    <td>{sauda.party_name ?? '—'}</td>
                    <td>{sauda.item_name ?? '—'}</td>
                    <td>{sauda.direction ?? '—'}</td>
                    <td>{archivedLabel(sauda.deleted_at)}</td>
                    <td>
                      <TableActions>
                        <Button type="button" disabled={restoringId === sauda.id} onClick={() => void restore('sauda', sauda.id, sauda.code ?? 'sauda')}>
                          {restoringId === sauda.id ? 'Restoring…' : 'Restore'}
                        </Button>
                      </TableActions>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={SAUDA_COLUMNS.length}><EmptyState>No archived saudas.</EmptyState></td></tr>
                )}
              </DataTable>
            </TableCard>
          )}

          {tab === 'processing' && (
            <TableCard title="Archived processing setup" subtitle={`${processingRows.length} archived`}>
              <DataTable columns={PROCESS_COLUMNS}>
                {processingRows.length ? processingRows.map((entry) => (
                  <tr key={`${entry.restoreKind}-${entry.id}`}>
                    <td><strong>{entry.name}</strong></td>
                    <td>{entry.kind}</td>
                    <td>{archivedLabel(entry.deleted_at)}</td>
                    <td>
                      <TableActions>
                        {canRestore ? (
                          <Button type="button" disabled={restoringId === entry.id} onClick={() => void restore(entry.restoreKind, entry.id, entry.name)}>
                            {restoringId === entry.id ? 'Restoring…' : 'Restore'}
                          </Button>
                        ) : null}
                      </TableActions>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={PROCESS_COLUMNS.length}><EmptyState>No archived process types or chains.</EmptyState></td></tr>
                )}
              </DataTable>
            </TableCard>
          )}
        </Panel>
        )}
      </section>
    </main>
  );
}
