'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { millHeaderMeta } from '../lib/app-meta';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Item = { id: string; name: string; category?: string | null; category_code?: string | null; hsn?: string | null; unit?: string | null; base_unit?: string | null; display_unit?: string | null; typical_otr_pct?: number | null };

const ITEM_COLUMNS = [
  { id: 'item', label: 'Item' },
  { id: 'category', label: 'Category' },
  { id: 'hsn', label: 'HSN' },
  { id: 'base', label: 'Base unit' },
  { id: 'display', label: 'Display unit' },
  { id: 'otr', label: 'Typical OTR' },
  { id: 'actions', label: '' },
];

export function ItemsApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', category: 'paddy', hsn: '', display_unit: 'QUINTAL', typical_otr_pct: '' });

  const load = async () => {
    const body = await api<{ items: Item[] }>('/api/overview');
    setItems(body.items);
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load items'));
  }, [session]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Item name is required.');
    try {
      await api('/api/items', json('POST', { ...form, typical_otr_pct: form.typical_otr_pct === '' ? undefined : Number(form.typical_otr_pct) }));
      setForm({ ...form, name: '', hsn: '', typical_otr_pct: '' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create item');
    }
  }

  async function edit(item: Item) {
    const name = window.prompt('Item name', item.name);
    if (!name?.trim()) return;
    try {
      await api(`/api/items/${item.id}`, json('PATCH', { name: name.trim() }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update item');
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
          actions={<AppLink href="/app"><Button className="quiet">Open Processing</Button></AppLink>}
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

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
                  <TableActions>
                    <Button type="button" className="secondary" onClick={() => void edit(item)}>Edit</Button>
                  </TableActions>
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
