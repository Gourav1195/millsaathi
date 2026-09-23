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
  PageHeader,
  Panel,
  ScreenToolbar,
  Select,
  TableActions,
  TableCard,
  Textarea,
} from './ui';
import { millHeaderMeta } from '../lib/app-meta';
import { can } from '../lib/permissions';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Document = { id: string; document_no?: string; document_type?: string; issue_date?: string; party_name?: string; status?: string; total_paise?: number; upload_name?: string | null; source?: string };
type Ref = { id: string; name?: string; code?: string; vehicle_no?: string };
type Overview = { suppliers: Ref[]; buyers: Ref[]; items: Ref[]; saudas: Ref[]; gate: Ref[] };
type Draft = { type: string; party: string; item_id: string; sauda_id: string; gate_entry_id: string; description: string; quantity: string; unit: string; rate: string; gst_rate: string; tax_mode: string; issue_date: string; notes: string };

const money = (paise: number | undefined) => paise == null ? 'Restricted' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({ type: 'SALES_INVOICE', party: '', item_id: '', sauda_id: '', gate_entry_id: '', description: '', quantity: '', unit: 'KG', rate: '', gst_rate: '5', tax_mode: 'INTRA', issue_date: today(), notes: '' });

const DOCUMENT_COLUMNS = [
  { id: 'document', label: 'Document' },
  { id: 'type', label: 'Type' },
  { id: 'party', label: 'Party' },
  { id: 'date', label: 'Issue date' },
  { id: 'total', label: 'Total' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '' },
];

export function DocumentsApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState('PAYMENT_RECEIPT');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [docs, refs] = await Promise.all([api<{ documents: Document[] }>('/api/documents'), api<Overview>('/api/overview')]);
    setDocuments(docs.documents);
    setOverview(refs);
  };

  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load documents'));
  }, [session]);

  async function uploadFile(event: FormEvent) {
    event.preventDefault();
    if (!upload) return setError('Choose a file to upload.');
    if (upload.size > 1024 * 1024) return setError('Uploads are limited to 1 MB.');
    const data = new FormData();
    data.set('file', upload);
    data.set('document_type', uploadType);
    try {
      setError(null);
      await api('/api/documents/upload', { method: 'POST', body: data });
      setUpload(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload document');
    }
  }

  async function createDocument(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    const ratePaise = Math.round(Number(draft.rate) * 100);
    const [partyKind, partyId] = draft.party.split(':');
    if (!draft.description.trim() || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(ratePaise) || ratePaise < 0) {
      setError('Enter a description, non-negative quantity, and valid rate.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const taxablePaise = Math.round(quantity * ratePaise);
      await api('/api/documents', json('POST', {
        document_type: draft.type,
        party_kind: partyId ? partyKind : null,
        party_id: partyId || null,
        sauda_id: draft.sauda_id || null,
        gate_entry_id: draft.gate_entry_id || null,
        issue_date: draft.issue_date,
        gst_rate_pct: Number(draft.gst_rate),
        tax_mode: draft.tax_mode,
        lines: [{
          item_id: draft.item_id || null,
          description: draft.description.trim(),
          quantity,
          unit: draft.unit,
          rate_paise: ratePaise,
          taxable_paise: taxablePaise,
          gst_rate_pct: Number(draft.gst_rate),
        }],
        notes: draft.notes.trim() || null,
      }));
      setDraft(emptyDraft());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create document');
    } finally {
      setSaving(false);
    }
  }

  async function voidDocument(document: Document) {
    const reason = window.prompt('Void reason (at least 3 characters)');
    if (!reason) return;
    try {
      setError(null);
      await api(`/api/documents/${document.id}/void`, json('POST', { reason }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not void document');
    }
  }

  const filtered = useMemo(
    () => documents.filter((document) => `${document.document_no ?? ''} ${document.document_type ?? ''} ${document.party_name ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    [documents, query],
  );
  const partyOptions = [...(overview?.suppliers ?? []).map((p) => ({ ...p, kind: 'supplier' })), ...(overview?.buyers ?? []).map((p) => ({ ...p, kind: 'buyer' }))];
  const canExport = can(session, 'documents:export');

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading documents…</p></main>;
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
          title="Documents"
          subtitle="Create, upload, print, and void protected business documents."
          date={headerMeta.date}
          season={headerMeta.season}
          actions={<AppLink href="/app/dashboard"><Button className="quiet">Dashboard</Button></AppLink>}
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        <Panel title="Add New business document">
          <FormGrid onSubmit={createDocument}>
            <Field label="Type">
              <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                <option>SALES_INVOICE</option>
                <option>PURCHASE_STATEMENT</option>
                <option>PAYMENT_RECEIPT</option>
                <option>WEIGHMENT_SLIP</option>
              </Select>
            </Field>
            <Field label="Party">
              <Select value={draft.party} onChange={(e) => setDraft({ ...draft, party: e.target.value })}>
                <option value="">Not specified</option>
                {partyOptions.map((p) => <option key={`${p.kind}-${p.id}`} value={`${p.kind}:${p.id}`}>{p.name ?? 'Party'} · {p.kind}</option>)}
              </Select>
            </Field>
            <Field label="Item">
              <Select value={draft.item_id} onChange={(e) => setDraft({ ...draft, item_id: e.target.value })}>
                <option value="">Not specified</option>
                {(overview?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Linked Sauda">
              <Select value={draft.sauda_id} onChange={(e) => setDraft({ ...draft, sauda_id: e.target.value })}>
                <option value="">Not specified</option>
                {(overview?.saudas ?? []).map((sauda) => <option key={sauda.id} value={sauda.id}>{sauda.code ?? sauda.id}</option>)}
              </Select>
            </Field>
            <Field label="Linked gate">
              <Select value={draft.gate_entry_id} onChange={(e) => setDraft({ ...draft, gate_entry_id: e.target.value })}>
                <option value="">Not specified</option>
                {(overview?.gate ?? []).map((gate) => <option key={gate.id} value={gate.id}>{gate.vehicle_no ?? gate.id}</option>)}
              </Select>
            </Field>
            <Field label="Description">
              <Input required value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label="Quantity">
              <Input required type="number" min="0" step="0.001" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
            </Field>
            <Field label="Unit">
              <Select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
                <option>KG</option>
                <option>QUINTAL</option>
                <option>TONNE</option>
                <option>BAG</option>
                <option>PIECE</option>
              </Select>
            </Field>
            <Field label="Rate ₹">
              <Input required type="number" min="0" step="0.01" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
            </Field>
            <Field label="GST %">
              <Input type="number" min="0" max="100" step="0.01" value={draft.gst_rate} onChange={(e) => setDraft({ ...draft, gst_rate: e.target.value })} />
            </Field>
            <Field label="Tax type">
              <Select value={draft.tax_mode} onChange={(e) => setDraft({ ...draft, tax_mode: e.target.value })}>
                <option value="INTRA">CGST + SGST</option>
                <option value="INTER">IGST</option>
              </Select>
            </Field>
            <Field label="Issue date">
              <Input required type="date" value={draft.issue_date} onChange={(e) => setDraft({ ...draft, issue_date: e.target.value })} />
            </Field>
            <Field label="Notes">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            <FormActions>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create document'}</Button>
            </FormActions>
          </FormGrid>
        </Panel>

        <Panel title="Upload document">
          <FormGrid onSubmit={uploadFile}>
            <Field label="Type">
              <Select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                <option>PAYMENT_RECEIPT</option>
                <option>PURCHASE_STATEMENT</option>
                <option>SALES_INVOICE</option>
                <option>WEIGHMENT_SLIP</option>
              </Select>
            </Field>
            <Field label="File (max 1 MB)">
              <Input type="file" onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />
            </Field>
            <FormActions>
              <Button type="submit">Upload</Button>
            </FormActions>
          </FormGrid>
        </Panel>

        <TableCard
          title="Documents"
          subtitle={`${filtered.length} document${filtered.length === 1 ? '' : 's'}`}
          actions={canExport ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <a className="ui-link" href="/api/documents/export.csv">Export CSV</a>
              <a className="ui-link" href="/api/documents/export.xls">Export Excel</a>
            </div>
          ) : null}
          toolbar={
            <ScreenToolbar>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search document number, type, or party"
                aria-label="Search documents"
              />
            </ScreenToolbar>
          }
        >
          <DataTable columns={DOCUMENT_COLUMNS}>
            {filtered.length ? filtered.map((document) => (
              <tr key={document.id}>
                <td><strong>{document.document_no ?? '—'}</strong></td>
                <td>{document.document_type ?? '—'}</td>
                <td>{document.party_name ?? '—'}</td>
                <td>{document.issue_date ?? '—'}</td>
                <td><strong>{session.role === 'manager' ? 'Restricted' : money(document.total_paise)}</strong></td>
                <td><Badge tone={document.status === 'POSTED' ? 'success' : 'neutral'}>{document.status ?? '—'}</Badge></td>
                <td>
                  <TableActions>
                    {document.upload_name && (
                      <a className="ui-link" href={`/api/documents/${document.id}/file`} target="_blank">Download</a>
                    )}
                    <a className="ui-link" href={`/api/documents/${document.id}/print`} target="_blank">Print</a>
                    {document.status === 'POSTED' && (
                      <Button type="button" className="secondary" onClick={() => void voidDocument(document)}>Void</Button>
                    )}
                  </TableActions>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={DOCUMENT_COLUMNS.length}><EmptyState>No matching documents.</EmptyState></td>
              </tr>
            )}
          </DataTable>
        </TableCard>
      </section>
    </main>
  );
}
