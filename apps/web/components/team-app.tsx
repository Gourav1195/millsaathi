'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';

type Member = { id: string; name: string; email: string; role?: string; role_code?: string; active?: number | boolean; preferred_unit?: string; created_at?: string };

export function TeamApp() {
  const { session, sessionError } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!session) return; void fetch('/api/team', { credentials: 'include' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Could not load team'); setMembers(body.members as Member[]); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load team')); }, [session]);
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading team…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<Link className="primary" href="/app">Go to login</Link></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Team</h2><p className="muted">Members and access roles. Invitations and role changes remain in the legacy app until their authorization flows are ported.</p></div><Link className="primary" href="/app/dashboard">Dashboard</Link></div>{error && <p className="error">{error}</p>}<section className="panel"><div className="team-header"><span>Member</span><span>Email</span><span>Role</span><span>Status</span><span>Preferred unit</span></div>{members.map((member) => <div className="team-row" key={member.id}><strong>{member.name}</strong><span>{member.email}</span><span>{member.role_code ?? member.role ?? '—'}</span><span className={member.active === false || member.active === 0 ? 'inactive' : 'active'}>{member.active === false || member.active === 0 ? 'Inactive' : 'Active'}</span><span>{member.preferred_unit ?? '—'}</span></div>)}{!members.length && !error && <p className="muted">No team members found.</p>}</section></section></main>;
}
