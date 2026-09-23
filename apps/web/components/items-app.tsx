'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './app-header';
import {
  Alert,
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
  TableCard,
} from './ui';
import {
  TableArchiveCell,
  TableEditCell,
  TableEditModeBar,
  TableEditModeButton,
} from './table-edit-mode';
import { millHeaderMeta } from '../lib/app-meta';
import { can } from '../lib/permissions';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Item = { id: string; name: string; category?: string | null; category_code?: string | null; hsn?: string | null; unit?: string | null; base_unit?: string | null; display_unit?: string | null; typical_otr_pct?: number | null };

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
  { id: 'base', label: 'Base unit' },
  { id: 'display', label: 'Display unit' },
  { id: 'otr', label: 'Typical OTR' },
];

const emptyForm = (): ItemForm => ({ name: '', category: 'paddy', hsn: '', display_unit: 'QUINTAL', typical_otr_pct: '' });

const formFromItem = (item: Item): ItemForm => ({
  name: item.name,
  category: item.category ?? 'paddy',
  hsn: item.hsn ?? '',
  display_unit: item.display_unit ?? item.unit ?? 'QUINTAL',
  typical_otr_pct: item.typical_otr_pct == null ? '' : String(item.typical_otr_pct),
});

export function ItemsApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const tableEdit = useTableEditMode();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [editing, setEditing] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const editDialogRef = useRef<HTMLDialogElement>(null);

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
    const dialog = editDialogRef.current;
    if (!dialog) return;
    if (editing && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

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
    setEditing(item);
    setEditForm(formFromItem(item));
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editForm.name.trim()) return setError('Item name is required.');
    setSaving(true);
    setError(null);
    try {
      await api(`/api/items/${editing.id}`, json('PATCH', {
        name: editForm.name.trim(),
        category: editForm.category,
        hsn: editForm.hsn,
        display_unit: editForm.display_unit,
        typical_otr_pct: editForm.typical_otr_pct === '' ? null : Number(editForm.typical_otr_pct),
      }));
      setEditing(null);
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
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive selected items');
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(
    () => items.filter((item) => `${item.name} ${item.category ?? ''} ${item.hsn ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

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
          subtitle="Item quantities retain the Worker’s KG base unit."
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
                  <option value="paddy">Paddy</option>
                  <option value="rice">Rice</option>
                  <option value="byproduct">Byproduct</option>
                  <option value="packaging">Packaging</option>
                  <option value="consumable">Consumable</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="HSN">
                <Input value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} />
              </Field>
              <Field label="Display unit">
                <Select value={form.display_unit} onChange={(e) => setForm({ ...form, display_unit: e.target.value })}>
                  <option>KG</option>
                  <option>QUINTAL</option>
                  <option>TONNE</option>
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
                  <h2>Edit item</h2>
                  <p><strong>{editing.name}</strong></p>
                </div>
                <button
                  type="button"
                  className="app-dialog-close ms-focus-ring"
                  aria-label="Close edit item dialog"
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
                <Field label="Category">
                  <Select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                    <option value="paddy">Paddy</option>
                    <option value="rice">Rice</option>
                    <option value="byproduct">Byproduct</option>
                    <option value="packaging">Packaging</option>
                    <option value="consumable">Consumable</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="HSN">
                  <Input value={editForm.hsn} onChange={(e) => setEditForm({ ...editForm, hsn: e.target.value })} />
                </Field>
                <Field label="Display unit">
                  <Select value={editForm.display_unit} onChange={(e) => setEditForm({ ...editForm, display_unit: e.target.value })}>
                    <option>KG</option>
                    <option>QUINTAL</option>
                    <option>TONNE</option>
                  </Select>
                </Field>
                <Field label="Typical OTR %">
                  <Input inputMode="decimal" value={editForm.typical_otr_pct} onChange={(e) => setEditForm({ ...editForm, typical_otr_pct: e.target.value })} />
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
          toolbar={
            <ScreenToolbar>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item, category, or HSN"
                aria-label="Search items"
              />
            </ScreenToolbar>
          }
        >
          <DataTable columns={withEditModeColumns(ITEM_COLUMNS_BASE, tableEdit.editMode, { canEdit, canArchive })}>
            {filtered.length ? filtered.map((item) => (
              <tr key={item.id}>
                {tableEdit.editMode && canArchive && (
                  <TableArchiveCell
                    label={item.name}
                    checked={!!tableEdit.selected[item.id]}
                    onChange={(checked) => tableEdit.toggleSelected(item.id, checked)}
                  />
                )}
                {tableEdit.editMode && canEdit && (
                  <TableEditCell label={item.name} onClick={() => startEdit(item)} />
                )}
                <td><strong>{item.name}</strong></td>
                <td>{item.category ?? item.category_code ?? '—'}</td>
                <td>{item.hsn ?? '—'}</td>
                <td>{item.base_unit ?? 'KG'}</td>
                <td>{item.display_unit ?? item.unit ?? '—'}</td>
                <td>{item.typical_otr_pct == null ? '—' : `${item.typical_otr_pct}%`}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={withEditModeColumns(ITEM_COLUMNS_BASE, tableEdit.editMode, { canEdit, canArchive }).length}><EmptyState>No matching items.</EmptyState></td>
              </tr>
            )}
          </DataTable>
        </TableCard>
      </section>
    </main>
  );
}
