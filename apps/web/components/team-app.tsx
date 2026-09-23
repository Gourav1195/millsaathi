'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useState } from 'react';
import { AppHeader } from './app-header';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Member = { id: string; name: string; email: string; role?: string; role_code?: string; active?: number | boolean; preferred_unit?: string };
type AccountForm = { name: string; email: string; role: string; password: string };
const roles = ['admin', 'manager', 'accountant', 'gate_operator', 'production_operator', 'viewer'];
const emptyAccount = (): AccountForm => ({ name: '', email: '', role: 'viewer', password: '' });

export function TeamApp() {
  const { session, sessionError } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [mode, setMode] = useState<'account' | 'invite'>('account');
  const [form, setForm] = useState<AccountForm>(emptyAccount);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => setMembers((await api<{ members: Member[] }>('/api/team')).members);
  useEffect(() => { if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load team')); }, [session]);
  const canManage = session != null && ['owner', 'admin'].includes(session.role);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || (mode === 'account' && form.password.length < 8)) { setError(mode === 'account' ? 'Enter a name, valid email, and a password of at least 8 characters.' : 'Enter a name and valid email.'); return; }
    setSaving(true); setError(null); setInviteUrl(null);
    try {
      if (mode === 'account') await api('/api/team/account', json('POST', { ...form, name: form.name.trim(), email: form.email.trim() }));
      else {
        const result = await api<{ invite_url: string }>('/api/team/invite', json('POST', { name: form.name.trim(), email: form.email.trim(), role: form.role }));
        setInviteUrl(result.invite_url);
      }
      setForm(emptyAccount()); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save team member'); } finally { setSaving(false); }
  }
  async function updateMember(member: Member, patch: Record<string, unknown>) {
    try { setError(null); await api(`/api/team/${member.id}`, json('PATCH', patch)); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update team member'); }
  }
  async function copyInvite() {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(new URL(inviteUrl, window.location.origin).toString()); }
    catch { setError('Copy the invitation link manually from the field below.'); }
  }
  if (session === undefined) return <main className="auth-page"><p className="muted">Loading team…</p></main>;
  if (!session) return <main className="auth-page"><div className="auth-card"><h1>Sign in required</h1>{sessionError && <p className="error">{sessionError}</p>}<AppLink className="primary" href="/app">Go to login</AppLink></div></main>;
  return <main className="shell"><AppHeader session={session} /><section className="workspace"><div className="dashboard-heading"><div><h2>Team</h2><p className="muted">Accounts, roles, and shareable invitations are enforced by the Worker.</p></div><AppLink className="primary" href="/app/dashboard">Dashboard</AppLink></div>{error && <p className="error">{error}</p>}
    {canManage && <section className="panel"><div className="party-controls"><h2>{mode === 'account' ? 'Create active account' : 'Invite a team member'}</h2><div className="filter-tabs"><button className={mode === 'account' ? 'selected' : ''} onClick={() => setMode('account')}>Create account</button><button className={mode === 'invite' ? 'selected' : ''} onClick={() => setMode('invite')}>Invite link</button></div></div><form className="workflow-form" onSubmit={create}><label>Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{roles.map(role => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}</select></label>{mode === 'account' && <label>Temporary password<input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>}<button className="post" disabled={saving}>{saving ? 'Saving…' : mode === 'account' ? 'Create account' : 'Create invitation'}</button></form>{inviteUrl && <div className="workflow-form"><label>Share this invitation link<input readOnly value={new URL(inviteUrl, typeof window === 'undefined' ? 'https://millsaathi.com' : window.location.origin).toString()} /></label><button className="secondary" type="button" onClick={() => void copyInvite()}>Copy link</button></div>}</section>}
    <section className="panel" style={{ marginTop: 16 }}><div className="team-header"><span>Member</span><span>Email</span><span>Role</span><span>Status</span><span>Preferred unit</span></div>{members.map((member) => { const active = !(member.active === false || member.active === 0); const role = member.role_code ?? member.role ?? 'viewer'; const self = member.id === session.id; return <div className="team-row" key={member.id}><strong>{member.name}</strong><span>{member.email}</span><span>{canManage && role !== 'owner' && !self ? <select aria-label={`Role for ${member.name}`} value={role} onChange={e => void updateMember(member, { role: e.target.value })}>{roles.map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select> : role.replaceAll('_', ' ')}</span><span className="inline-actions"><span className={active ? 'active' : 'inactive'}>{active ? 'Active' : 'Inactive'}</span>{canManage && !self && role !== 'owner' && <button onClick={() => void updateMember(member, { active: active ? 0 : 1 })}>{active ? 'Deactivate' : 'Activate'}</button>}</span><span>{member.preferred_unit ?? '—'}</span></div>; })}{!members.length && !error && <p className="muted">No team members found.</p>}</section></section></main>;
}
