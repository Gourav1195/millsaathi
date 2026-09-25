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
import { filterRows, paginate, PAGE_SIZE } from '../lib/list-view';
import { can } from '../lib/permissions';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';
import {
  formatDualQuantity,
  trackingModeLabel,
  type TrackingMode,
} from '../../../shared/quantity';

type Item = {
  id: string;
  name: string;
  category?: string | null;
  category_code?: string | null;
  hsn?: string | null;
  unit?: string | null;
  base_unit?: string | null;
  display_unit?: string | null;
  tracking_mode?: TrackingMode | null;
  gate_bag_count_required?: number | null;
  default_rate_unit?: string | null;
  package_unit?: string | null;
  package_quantity_base?: number | null;
  typical_otr_pct?: number | null;
  stock_kg?: number | null;
};

type ItemForm = {
  name: string;
  category: string;
  hsn: string;
  tracking_mode: TrackingMode;
  display_unit: string;
  gate_bag_count_required: boolean;
  package_quantity_base: string;
  default_rate_unit: string;
  typical_otr_pct: string;
};

const ITEM_COLUMNS_BASE = [
  { id: 'item', label: 'Item' },
  { id: 'category', label: 'Category' },
  { id: 'tracking', label: 'Measured as' },
  { id: 'hsn', label: 'HSN' },
  { id: 'stock', label: 'Stock' },
  { id: 'otr', label: 'Typical OTR' },
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

const CATEGORY_CODE_TO_FORM: Record<string, string> = {
  RAW_MATERIAL: 'paddy',
  FINISHED_GOOD: 'rice',
  BYPRODUCT: 'byproduct',
  PACKAGING: 'packaging',
  CONSUMABLE: 'consumable',
  OTHER: 'other',
};

const DISPLAY_UNITS = ['KG', 'QUINTAL', 'TONNE'];
const TRACKING_MODE_OPTIONS: { value: TrackingMode; label: string; helper: string }[] = [
  { value: 'WEIGHT_ONLY', label: 'Weight only', helper: 'Stock is recorded in kg, quintals, or tonnes.' },
  { value: 'VARIABLE_BAG', label: 'Bags with variable weight', helper: 'Every receipt is weighed; bag count is recorded separately.' },
  { value: 'FIXED_PACKAGE', label: 'Fixed-weight bags or packs', helper: 'Each pack has the same declared weight.' },
  { value: 'COUNT_ONLY', label: 'Pieces / count only', helper: 'Stock is recorded as a whole count.' },
];

const RATE_UNIT_OPTIONS: Record<TrackingMode, { value: string; label: string }[]> = {
  WEIGHT_ONLY: [{ value: 'QTL', label: 'Per quintal' }, { value: 'KG', label: 'Per kg' }],
  VARIABLE_BAG: [{ value: 'QTL', label: 'Per quintal' }, { value: 'BAG', label: 'Per bag' }],
  FIXED_PACKAGE: [{ value: 'BAG', label: 'Per bag' }, { value: 'QTL', label: 'Per quintal' }],
  COUNT_ONLY: [{ value: 'PIECE', label: 'Per piece' }],
};

const emptyForm = (): ItemForm => ({
  name: '',
  category: 'paddy',
  hsn: '',
  tracking_mode: 'WEIGHT_ONLY',
  display_unit: 'QUINTAL',
  gate_bag_count_required: true,
  package_quantity_base: '',
  default_rate_unit: 'QTL',
  typical_otr_pct: '',
});

function formCategoryFromItem(item: Item): string {
  if (item.category_code && CATEGORY_CODE_TO_FORM[item.category_code]) {
    return CATEGORY_CODE_TO_FORM[item.category_code];
  }
  return item.category ?? 'paddy';
}

const formFromItem = (item: Item): ItemForm => ({
  name: item.name,
  category: formCategoryFromItem(item),
  hsn: item.hsn ?? '',
  tracking_mode: (item.tracking_mode ?? 'WEIGHT_ONLY') as TrackingMode,
  display_unit: item.display_unit ?? item.unit ?? 'QUINTAL',
  gate_bag_count_required: item.gate_bag_count_required !== 0,
  package_quantity_base: item.package_quantity_base == null ? '' : String(item.package_quantity_base),
  default_rate_unit: item.default_rate_unit ?? 'QTL',
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
  const mode = (item.tracking_mode ?? 'WEIGHT_ONLY') as TrackingMode;
  if (mode === 'COUNT_ONLY') {
    return formatDualQuantity({ trackingMode: mode, pieceCount: item.stock_kg ?? 0 });
  }
  return formatDualQuantity({
    weightKg: item.stock_kg ?? 0,
    displayUnit: item.display_unit ?? 'QUINTAL',
    trackingMode: mode,
  });
}

function itemPayload(form: ItemForm) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    category: form.category,
    hsn: form.hsn,
    tracking_mode: form.tracking_mode,
    default_rate_unit: form.default_rate_unit,
    typical_otr_pct: form.typical_otr_pct === '' ? undefined : Number(form.typical_otr_pct),
  };
  if (form.tracking_mode === 'WEIGHT_ONLY' || form.tracking_mode === 'VARIABLE_BAG') {
    payload.display_unit = form.display_unit;
  }
  if (form.tracking_mode === 'VARIABLE_BAG') {
    payload.gate_bag_count_required = form.gate_bag_count_required;
  }
  if (form.tracking_mode === 'FIXED_PACKAGE') {
    payload.package_unit = 'BAG';
    payload.package_quantity_base = Number(form.package_quantity_base);
    payload.display_unit = form.display_unit;
  }
  return payload;
}

function TrackingModeFields({
  form,
  setForm,
  showOtr,
}: {
  form: ItemForm;
  setForm: (next: ItemForm) => void;
  showOtr: boolean;
}) {
  const selected = TRACKING_MODE_OPTIONS.find((option) => option.value === form.tracking_mode);
  return (
    <>
      <Field label="How is this item measured?">
        <Select
          value={form.tracking_mode}
          onChange={(e) => {
            const mode = e.target.value as TrackingMode;
            setForm({
              ...form,
              tracking_mode: mode,
              default_rate_unit: RATE_UNIT_OPTIONS[mode][0]?.value ?? 'QTL',
            });
          }}
        >
          {TRACKING_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        {selected ? <small className="muted">{selected.helper}</small> : null}
      </Field>

      {(form.tracking_mode === 'WEIGHT_ONLY' || form.tracking_mode === 'VARIABLE_BAG' || form.tracking_mode === 'FIXED_PACKAGE') && (
        <Field label="How should weight normally be shown?">
          <Select value={form.display_unit} onChange={(e) => setForm({ ...form, display_unit: e.target.value })}>
            {DISPLAY_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
          </Select>
        </Field>
      )}

      {form.tracking_mode === 'VARIABLE_BAG' && (
        <Field label="Require bag count at Gate">
          <Select
            value={form.gate_bag_count_required ? 'yes' : 'no'}
            onChange={(e) => setForm({ ...form, gate_bag_count_required: e.target.value === 'yes' })}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
          <small className="muted">Average bag weight is calculated from each receipt&apos;s measured weight.</small>
        </Field>
      )}

      {form.tracking_mode === 'FIXED_PACKAGE' && (
        <Field label="Declared weight per bag/pack (kg)">
          <Input
            required
            inputMode="decimal"
            value={form.package_quantity_base}
            onChange={(e) => setForm({ ...form, package_quantity_base: e.target.value })}
          />
          <small className="muted">Count times declared pack weight is used because the package is fixed.</small>
        </Field>
      )}

      <Field label="How do you usually quote the rate?">
        <Select value={form.default_rate_unit} onChange={(e) => setForm({ ...form, default_rate_unit: e.target.value })}>
          {RATE_UNIT_OPTIONS[form.tracking_mode].map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </Field>

      {showOtr && (
        <Field label="Typical OTR %">
          <Input inputMode="decimal" value={form.typical_otr_pct} onChange={(e) => setForm({ ...form, typical_otr_pct: e.target.value })} />
        </Field>
      )}
    </>
  );
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
      await api('/api/items', json('POST', itemPayload(form)));
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
      await api(`/api/items/${itemId}`, json('PATCH', itemPayload(editForm)));
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
          subtitle="Configure how each material is measured, displayed, and quoted."
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
              <TrackingModeFields
                form={form}
                setForm={setForm}
                showOtr={form.category === 'paddy'}
              />
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
              const mode = (item.tracking_mode ?? 'WEIGHT_ONLY') as TrackingMode;
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
                      <Select
                        value={editForm.tracking_mode}
                        onChange={(e) => setEditForm({ ...editForm, tracking_mode: e.target.value as TrackingMode })}
                      >
                        {TRACKING_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </Select>
                    ) : (
                      trackingModeLabel(mode)
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
