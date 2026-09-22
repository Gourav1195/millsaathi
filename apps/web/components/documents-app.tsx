'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Document = { id: string; document_no?: string; document_type?: string; issue_date?: string; party_name?: string; status?: string; total_paise?: number; upload_name?: string | null; source?: string };
const money = (paise: number | undefined) => paise == null ? 'Restricted' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export function DocumentsApp() {
  const { session, sessionError } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/documents', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load documents'); setDocuments(body.documents as Document[]); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load documents')); }, [session]);
  const filtered = useMemo(() => documents.filter((document) => `${document.document_no ?? ''} ${document.document_type ?? ''} ${document.party_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [documents, query]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading documents…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Documents</h2><p className="muted">Operational documents and uploads. Issuing, voiding, uploading, and printing stay in the legacy UI until their permission checks are ported.</p></div><Link className="primary" href="/app/dashboard">Dashboard</Link></div>{error && <p className="error">{error}</p>}<input className="stock-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search document number, type, or party" aria-label="Search documents" /><section className="panel" style={{ marginTop: 16 }}><div className="document-header"><span>Document</span><span>Type</span><span>Party</span><span>Issue date</span><span>Total</span><span>Status</span></div>{filtered.map((document) => <div className="document-row" key={document.id}><strong>{document.document_no ?? '—'}</strong><span>{document.document_type ?? '—'}</span><span>{document.party_name ?? '—'}</span><span>{document.issue_date ?? '—'}</span><strong>{session.role === 'manager' ? 'Restricted' : money(document.total_paise)}</strong><span className="status">{document.status ?? '—'}</span></div>)}{!filtered.length && <p className="muted">No matching documents.</p>}</section></section></main>;
}
