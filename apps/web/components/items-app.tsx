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
  TableActions,
  TableCard,
} from './ui';
import { useArchiveDialog } from './archive-dialog';
import { millHeaderMeta } from '../lib/app-meta';
import { can } from '../lib/permissions';
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

const ITEM_COLUMNS = [
  { id: 'item', label: 'Item' },
  { id: 'category', label: 'Category' },
  { id: 'hsn', label: 'HSN' },
  { id: 'base', label: 'Base unit' },
  { id: 'display', label: 'Display unit' },
  { id: 'otr', label: 'Typical OTR' },
  { id: 'actions', label: '' },
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
  const { requestArchive } = useArchiveDialog();
  const headerMeta = millHeaderMeta(session);
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

  function archive(item: Item) {
    requestArchive({
      title: 'Archive item?',
      name: item.name,
      confirmLabel: 'Archive item',
      onConfirm: async () => {
        await api(`/api/items/${item.id}`, json('DELETE', {}));
        await load();
      },
    });
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
          <DataTable columns={ITEM_COLUMNS}>
            {filtered.length ? filtered.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong></td>
                <td>{item.category ?? item.category_code ?? '—'}</td>
                <td>{item.hsn ?? '—'}</td>
                <td>{item.base_unit ?? 'KG'}</td>
                <td>{item.display_unit ?? item.unit ?? '—'}</td>
                <td>{item.typical_otr_pct == null ? '—' : `${item.typical_otr_pct}%`}</td>
                <td>
                  {(canEdit || canArchive) && (
                    <TableActions>
                      {canEdit && (
                        <Button type="button" className="secondary" onClick={() => startEdit(item)}>Edit</Button>
                      )}
                      {canArchive && (
                        <Button type="button" className="secondary" onClick={() => archive(item)}>Archive</Button>
                      )}
                    </TableActions>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={ITEM_COLUMNS.length}><EmptyState>No matching items.</EmptyState></td>
              </tr>
            )}
          </DataTable>
        </TableCard>
      </section>
    </main>
  );
}
