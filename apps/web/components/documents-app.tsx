'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Document = { id: string; document_no?: string; document_type?: string; issue_date?: string; party_name?: string; status?: string; total_paise?: number; upload_name?: string | null; source?: string };
const money = (paise: number | undefined) => paise == null ? 'Restricted' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export function DocumentsApp() {
  const { session, sessionError } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<File | null>(null); const [type, setType] = useState('PAYMENT_RECEIPT');
  const load = async () => setDocuments((await api<{ documents: Document[] }>('/api/documents')).documents);
  useEffect(() => { if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load documents')); }, [session]);
  async function uploadFile(event: React.FormEvent) { event.preventDefault(); if (!upload) return setError('Choose a file to upload.'); if (upload.size > 1024 * 1024) return setError('Uploads are limited to 1 MB.'); const data = new FormData(); data.set('file', upload); data.set('document_type', type); try { await api('/api/documents/upload', { method: 'POST', body: data }); setUpload(null); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload document'); } }
  async function voidDocument(document: Document) { const reason = window.prompt('Void reason (at least 3 characters)'); if (!reason) return; try { await api(`/api/documents/${document.id}/void`, json('POST', { reason })); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not void document'); } }
  const filtered = useMemo(() => documents.filter((document) => `${document.document_no ?? ''} ${document.document_type ?? ''} ${document.party_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [documents, query]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading documents…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Documents</h2><p className="muted">Downloads and prints use the Worker’s protected document endpoints.</p></div><Link className="primary" href="/app/dashboard">Dashboard</Link></div>{error && <p className="error">{error}</p>}<section className="panel"><h2>Upload document</h2><form className="workflow-form" onSubmit={uploadFile}><label>Type<select value={type} onChange={e => setType(e.target.value)}><option>PAYMENT_RECEIPT</option><option>PURCHASE_STATEMENT</option><option>SALES_INVOICE</option><option>WEIGHMENT_SLIP</option></select></label><label>File (max 1 MB)<input type="file" onChange={e => setUpload(e.target.files?.[0] ?? null)}/></label><button className="post">Upload</button></form></section><input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search document number, type, or party" aria-label="Search documents" /><section className="panel" style={{ marginTop: 16 }}><div className="document-header"><span>Document</span><span>Type</span><span>Party</span><span>Issue date</span><span>Total</span><span>Status</span></div>{filtered.map((document) => <div className="document-row" key={document.id}><strong>{document.document_no ?? '—'}</strong><span>{document.document_type ?? '—'}</span><span>{document.party_name ?? '—'}</span><span>{document.issue_date ?? '—'}</span><strong>{session.role === 'manager' ? 'Restricted' : money(document.total_paise)}</strong><span className="inline-actions"><span className="status">{document.status ?? '—'}</span>{document.upload_name && <a href={`/api/documents/${document.id}/file`} target="_blank">Download</a>}<a href={`/api/documents/${document.id}/print`} target="_blank">Print</a>{document.status === 'POSTED' && <button onClick={() => void voidDocument(document)}>Void</button>}</span></div>)}{!filtered.length && <p className="muted">No matching documents.</p>}</section></section></main>;
}
