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
  FilterSearch,
  FormActions,
  FormGrid,
  Input,
  PageHeader,
  Panel,
  RangeField,
  Select,
  TableActions,
  TableCard,
  TableFilters,
  TablePager,
} from './ui';
import {
  TableArchiveCell,
  TableEditModeBar,
  TableEditModeButton,
} from './table-edit-mode';
import { millHeaderMeta } from '../lib/app-meta';
import { baseToDisplay } from '../lib/chain-run';
import { filterRows, paginate, PAGE_SIZE } from '../lib/list-view';
import { can } from '../lib/permissions';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Item = {
  id: string;
  name: string;
  category?: string | null;
  category_code?: string | null;
  hsn?: string | null;
  unit?: string | null;
  base_unit?: string | null;
  display_unit?: string | null;
  typical_otr_pct?: number | null;
  stock_kg?: number | null;
};

type ItemForm = {
  name: string;
  category: string;
  hsn: string;
  display_unit: string;
  typical_otr_pct: string;
};

const ITEM_COLUMNS_BASE = [
  { id: 'item', label: 'Item' },
  { id: 'category', label: 'Category' },
  { id: 'hsn', label: 'HSN' },
  { id: 'stock', label: 'Stock' },
  { id: 'otr', label: 'Typical OTR' },
  { id: 'unit', label: 'Unit' },
];

const CATEGORY_OPTIONS = [
  { value: 'paddy', label: 'Paddy (raw material)' },
  { value: 'rice', label: 'Rice (finished good)' },
  { value: 'byproduct', label: 'By-product' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_FILTER_OPTIONS = [
  { value: 'RAW_MATERIAL', label: 'Raw material' },
  { value: 'FINISHED_GOOD', label: 'Finished good' },
  { value: 'BYPRODUCT', label: 'By-product' },
  { value: 'PACKAGING', label: 'Packaging' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'OTHER', label: 'Other' },
];

const DISPLAY_UNITS = ['KG', 'QUINTAL', 'TONNE'];

const emptyForm = (): ItemForm => ({ name: '', category: 'paddy', hsn: '', display_unit: 'QUINTAL', typical_otr_pct: '' });

const formFromItem = (item: Item): ItemForm => ({
  name: item.name,
  category: item.category ?? 'paddy',
  hsn: item.hsn ?? '',
  display_unit: item.display_unit ?? item.unit ?? 'QUINTAL',
  typical_otr_pct: item.typical_otr_pct == null ? '' : String(item.typical_otr_pct),
});

function categoryCode(item: Item) {
  if (item.category_code) return item.category_code;
  if (item.category === 'paddy') return 'RAW_MATERIAL';
  if (item.category === 'rice') return 'FINISHED_GOOD';
  if (item.category === 'byproduct') return 'BYPRODUCT';
  return 'OTHER';
}

function categoryLabel(item: Item) {
  const code = categoryCode(item);
  return CATEGORY_FILTER_OPTIONS.find((option) => option.value === code)?.label
    ?? item.category
    ?? '—';
}

function categoryTone(item: Item): 'warning' | 'success' | 'neutral' | 'gold' {
  const code = categoryCode(item);
  if (code === 'RAW_MATERIAL') return 'warning';
  if (code === 'FINISHED_GOOD') return 'success';
  if (code === 'BYPRODUCT') return 'neutral';
  return 'gold';
}

function stockLabel(item: Item) {
  const unit = (item.display_unit ?? item.unit ?? 'QUINTAL').toUpperCase();
  const qty = baseToDisplay(item.stock_kg ?? 0, unit);
  const suffix = unit === 'QUINTAL' ? 'qtl' : unit.toLowerCase();
  return `${qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${suffix}`;
}

export function ItemsApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const tableEdit = useTableEditMode();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const canEdit = can(session, 'items:edit');
  const canArchive = can(session, 'items:archive');
  const canCreate = can(session, 'items:create');

  const load = async () => {
    const body = await api<{ items: Item[] }>('/api/overview');
    setItems(body.items);
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load items'));
  }, [session]);

  useEffect(() => {
    setPage(0);
  }, [query, filters]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Item name is required.');
    try {
      await api('/api/items', json('POST', {
        ...form,
        typical_otr_pct: form.typical_otr_pct === '' ? undefined : Number(form.typical_otr_pct),
      }));
      setForm(emptyForm());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create item');
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditForm(formFromItem(item));
    setError(null);
  }

  function cancelEdit() {
    if (saving) return;
    setEditingId(null);
  }

  async function saveEdit(itemId: string) {
    if (!editForm.name.trim()) return setError('Item name is required.');
    setSaving(true);
    setError(null);
    try {
      await api(`/api/items/${itemId}`, json('PATCH', {
        name: editForm.name.trim(),
        category: editForm.category,
        hsn: editForm.hsn,
        display_unit: editForm.display_unit,
        typical_otr_pct: editForm.typical_otr_pct === '' ? null : Number(editForm.typical_otr_pct),
      }));
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update item');
    } finally {
      setSaving(false);
    }
  }

  async function bulkArchiveItems() {
    if (!tableEdit.selectedIds.length) return;
    const selectedItems = items.filter((item) => tableEdit.selected[item.id]);
    if (!window.confirm(`Archive ${selectedItems.length} selected item${selectedItems.length === 1 ? '' : 's'}?`)) return;
    setSaving(true);
    setError(null);
    try {
      for (const item of selectedItems) {
        await api(`/api/items/${item.id}`, json('DELETE', {}));
      }
      tableEdit.exitEditMode();
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive selected items');
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(
    () => filterRows(items, query, filters, {
      quantityKg: (item) => item.stock_kg,
      match: (item, activeFilters) => !activeFilters.category || categoryCode(item) === activeFilters.category,
    }),
    [items, query, filters],
  );

  const pageData = useMemo(() => paginate(filtered, page), [filtered, page]);

  const itemColumns = useMemo(() => {
    const columns = withEditModeColumns(ITEM_COLUMNS_BASE, tableEdit.editMode, { canEdit: false, canArchive });
    if (canEdit) columns.push({ id: 'actions', label: '' });
    return columns;
  }, [tableEdit.editMode, canArchive, canEdit]);

  const clearFilters = () => {
    setQuery('');
    setFilters({});
    setPage(0);
  };

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading items…</p></main>;
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
          title="Items"
          subtitle="Raw materials, finished goods and by-products. Output ratio tracks expected yield."
          date={headerMeta.date}
          season={headerMeta.season}
          actions={
            <TableEditModeButton
              enabled={canEdit || canArchive}
              editMode={tableEdit.editMode}
              onToggle={tableEdit.toggleEditMode}
            />
          }
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        {canCreate && (
          <Panel title="Add New item">
            <FormGrid onSubmit={save}>
              <Field label="Name">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Category">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="HSN">
                <Input value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} />
              </Field>
              <Field label="Display unit">
                <Select value={form.display_unit} onChange={(e) => setForm({ ...form, display_unit: e.target.value })}>
                  {DISPLAY_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                </Select>
              </Field>
              <Field label="Typical OTR %">
                <Input inputMode="decimal" value={form.typical_otr_pct} onChange={(e) => setForm({ ...form, typical_otr_pct: e.target.value })} />
              </Field>
              <FormActions>
                <Button type="submit">Create item</Button>
              </FormActions>
            </FormGrid>
          </Panel>
        )}

        <TableCard
          title="Items"
          subtitle={`${filtered.length} item${filtered.length === 1 ? '' : 's'}`}
          actions={
            <TableEditModeBar
              visible={tableEdit.editMode && canArchive}
              selectedCount={tableEdit.selectedIds.length}
              onArchive={() => void bulkArchiveItems()}
              archiving={saving}
            />
          }
        >
          <TableFilters
            compact
            onClear={clearFilters}
            clearDisabled={!query && !Object.keys(filters).length}
          >
            <FilterSearch
              value={query}
              onChange={(value) => { setQuery(value); setPage(0); }}
              placeholder="Search items…"
              aria-label="Search items"
            />
            <Select
              className="table-filter"
              aria-label="Filter by category"
              value={filters.category ?? ''}
              onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(0); }}
            >
              <option value="">All categories</option>
              {CATEGORY_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <RangeField
              label="Qty qtl"
              min={filters.min_qty ?? ''}
              max={filters.max_qty ?? ''}
              onMinChange={(value) => { setFilters({ ...filters, min_qty: value }); setPage(0); }}
              onMaxChange={(value) => { setFilters({ ...filters, max_qty: value }); setPage(0); }}
            />
          </TableFilters>

          <DataTable columns={itemColumns}>
            {pageData.rows.length ? pageData.rows.map((item) => {
              const editing = editingId === item.id;
              return (
                <tr key={item.id} className={editing ? 'table-row-editing' : undefined}>
                  {tableEdit.editMode && canArchive && (
                    <TableArchiveCell
                      label={item.name}
                      checked={!!tableEdit.selected[item.id]}
                      onChange={(checked) => tableEdit.toggleSelected(item.id, checked)}
                    />
                  )}
                  <td>
                    {editing ? (
                      <Input
                        required
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        aria-label={`Edit name for ${item.name}`}
                      />
                    ) : (
                      <strong>{item.name}</strong>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <Select
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        aria-label={`Edit category for ${item.name}`}
                      >
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone={categoryTone(item)}>{categoryLabel(item)}</Badge>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <Input
                        value={editForm.hsn}
                        onChange={(e) => setEditForm({ ...editForm, hsn: e.target.value })}
                        aria-label={`Edit HSN for ${item.name}`}
                      />
                    ) : (
                      item.hsn ?? '—'
                    )}
                  </td>
                  <td><strong>{stockLabel(item)}</strong></td>
                  <td>
                    {editing ? (
                      <Input
                        inputMode="decimal"
                        value={editForm.typical_otr_pct}
                        onChange={(e) => setEditForm({ ...editForm, typical_otr_pct: e.target.value })}
                        aria-label={`Edit typical OTR for ${item.name}`}
                      />
                    ) : (
                      item.typical_otr_pct == null ? '—' : `${item.typical_otr_pct}%`
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <Select
                        value={editForm.display_unit}
                        onChange={(e) => setEditForm({ ...editForm, display_unit: e.target.value })}
                        aria-label={`Edit display unit for ${item.name}`}
                      >
                        {DISPLAY_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                      </Select>
                    ) : (
                      (item.display_unit ?? item.unit ?? '—').toUpperCase()
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      {editing ? (
                        <TableActions>
                          <Button type="button" disabled={saving} onClick={() => void saveEdit(item.id)}>
                            {saving ? 'Saving…' : 'Save'}
                          </Button>
                          <Button type="button" className="secondary" disabled={saving} onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </TableActions>
                      ) : (
                        <Button type="button" className="secondary" onClick={() => startEdit(item)}>
                          Edit
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={itemColumns.length}><EmptyState>No matching items.</EmptyState></td>
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
      </section>
    </main>
  );
}
