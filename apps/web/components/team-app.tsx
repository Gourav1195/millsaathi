'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useState } from 'react';
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
  Select,
  TableCard,
  Tab,
  TabRow,
} from './ui';
import { TableEditModeButton } from './table-edit-mode';
import { millHeaderMeta } from '../lib/app-meta';
import { can, ROLE_LABELS, type Role } from '../lib/permissions';
import { useTableEditMode } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Member = { id: string; name: string; email: string; role?: string; role_code?: string; active?: number | boolean; created_at?: string };
type AccountForm = { name: string; email: string; role: string; password: string };

const roles = ['admin', 'manager', 'accountant', 'gate_operator', 'production_operator', 'viewer'] as const;
const emptyAccount = (): AccountForm => ({ name: '', email: '', role: 'viewer', password: '' });

function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role.replaceAll('_', ' ');
}

const TABLE_SELECT_PROPS = {
  className: 'table-inline-field',
  menuClassName: 'ui-dropdown-menu--table',
  menuPlacement: 'inline',
} as const;

const TEAM_COLUMNS = [
  { id: 'member', label: 'Member' },
  { id: 'email', label: 'Email' },
  { id: 'role', label: 'Role' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: 'Actions' },
];

function memberRole(member: Member): string {
  return member.role_code ?? member.role ?? 'viewer';
}

function memberActive(member: Member): boolean {
  return !(member.active === false || member.active === 0);
}

function memberStatusLabel(member: Member): string {
  return memberActive(member) ? 'Active' : 'Invited / inactive';
}

function memberStatusTone(member: Member): 'success' | 'warning' | 'danger' {
  return memberActive(member) ? 'success' : 'warning';
}

function memberManageable(member: Member, sessionId: string, canManage: boolean): boolean {
  return canManage && member.id !== sessionId && memberRole(member) !== 'owner';
}

export function TeamApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [members, setMembers] = useState<Member[]>([]);
  const [mode, setMode] = useState<'account' | 'invite'>('account');
  const [form, setForm] = useState<AccountForm>(emptyAccount);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [resetMemberName, setResetMemberName] = useState<string | null>(null);
  const tableEdit = useTableEditMode();

  const load = async () => setMembers((await api<{ members: Member[] }>('/api/team')).members);
  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load team'));
  }, [session]);

  const canManage = can(session, 'team:manage');

  function switchMode(next: 'account' | 'invite') {
    setMode(next);
    setInviteUrl(null);
    setError(null);
    setSuccess(null);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || (mode === 'account' && form.password.length < 8)) {
      setError(mode === 'account' ? 'Enter a name, valid email, and a password of at least 8 characters.' : 'Enter a name and valid email.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    setInviteUrl(null);
    try {
      const trimmed = { name: form.name.trim(), email: form.email.trim().toLowerCase() };
      if (mode === 'account') {
        const result = await api<{ id: string; activated?: boolean }>('/api/team/account', json('POST', { ...form, ...trimmed }));
        setSuccess(result.activated
          ? `${trimmed.name} was activated. They must change the temporary password on first sign-in.`
          : `${trimmed.name} can sign in with the temporary password you set. They will be asked to choose their own password on first sign-in.`);
      } else {
        const result = await api<{ invite_url: string; resent?: boolean }>('/api/team/invite', json('POST', { ...trimmed, role: form.role }));
        setInviteUrl(result.invite_url);
        setSuccess(result.resent ? `Invitation refreshed for ${trimmed.name}. Share the new link below.` : `Invitation created for ${trimmed.name}. Share the link below.`);
      }
      setForm(emptyAccount());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save team member');
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(memberId: string, patch: { role?: string; active?: number }) {
    setSavingMemberId(memberId);
    setError(null);
    try {
      await api(`/api/team/${memberId}`, json('PATCH', patch));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update team member');
      await load();
    } finally {
      setSavingMemberId(null);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(new URL(inviteUrl, window.location.origin).toString());
    } catch {
      setError('Copy the invitation link manually from the field below.');
    }
  }

  async function resetPassword(member: Member) {
    setSavingMemberId(member.id);
    setError(null);
    setSuccess(null);
    setResetUrl(null);
    setResetMemberName(null);
    try {
      const result = await api<{ reset_url: string }>(`/api/team/${member.id}/reset-password`, json('POST', {}));
      setResetUrl(result.reset_url);
      setResetMemberName(member.name);
      setSuccess(`Password reset link created for ${member.name}. Share the link below — it expires in 7 days and signs them out everywhere.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create password reset link');
    } finally {
      setSavingMemberId(null);
    }
  }

  async function copyResetLink() {
    if (!resetUrl) return;
    try {
      await navigator.clipboard.writeText(new URL(resetUrl, window.location.origin).toString());
    } catch {
      setError('Copy the reset link manually from the field below.');
    }
  }

  if (session === undefined) return <main className="auth-page"><p className="muted">Loading team…</p></main>;
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
          title="Team"
          subtitle="Accounts, roles, and shareable invitations are enforced by the Worker."
          date={headerMeta.date}
          season={headerMeta.season}
          actions={<AppLink href="/app"><Button className="quiet">Dashboard</Button></AppLink>}
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}
        {success && <Alert title="Saved" level="blue">{success}</Alert>}

        {!canManage && (
          <Alert title="View only" level="amber">
            Only owners and admins can invite or create team accounts. Ask your mill owner if you need someone added.
          </Alert>
        )}

        {canManage && (
          <Panel
            title={mode === 'account' ? 'Create active account' : 'Invite a team member'}
            actions={
              <TabRow>
                <Tab selected={mode === 'account'} onClick={() => switchMode('account')}>Create account</Tab>
                <Tab selected={mode === 'invite'} onClick={() => switchMode('invite')}>Invite link</Tab>
              </TabRow>
            }
          >
            <FormGrid onSubmit={create}>
              <Field label="Name">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Role">
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                </Select>
              </Field>
              {mode === 'account' && (
                <Field label="Temporary password">
                  <Input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Field>
              )}
              <FormActions>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : mode === 'account' ? 'Create account' : 'Create invitation'}
                </Button>
              </FormActions>
            </FormGrid>
            {mode === 'invite' && inviteUrl && (
              <div className="ui-form-grid" style={{ marginTop: 14 }}>
                <Field label="Share this invitation link">
                  <Input readOnly value={new URL(inviteUrl, typeof window === 'undefined' ? 'https://millsaathi.com' : window.location.origin).toString()} />
                </Field>
                <FormActions>
                  <Button className="secondary" type="button" onClick={() => void copyInvite()}>Copy link</Button>
                </FormActions>
              </div>
            )}
          </Panel>
        )}

        <TableCard
          className={tableEdit.editMode && canManage ? 'team-table-editing' : ''}
          title="Team members"
          subtitle={
            tableEdit.editMode && canManage
              ? 'Update role or access inline, or issue a password reset link. Your account and the owner stay locked.'
              : `${members.length} member${members.length === 1 ? '' : 's'}`
          }
          actions={canManage ? (
            <TableEditModeButton
              enabled={canManage}
              editMode={tableEdit.editMode}
              onToggle={tableEdit.toggleEditMode}
            />
          ) : undefined}
        >
          <DataTable columns={TEAM_COLUMNS}>
            {members.length ? members.map((member) => {
              const active = memberActive(member);
              const role = memberRole(member);
              const manageable = memberManageable(member, session.id, canManage);
              const editing = tableEdit.editMode && manageable;
              const rowSaving = savingMemberId === member.id;
              return (
                <tr key={member.id} className={rowSaving ? 'table-row-saving' : undefined}>
                  <td><strong>{member.name}</strong></td>
                  <td>{member.email}</td>
                  <td className="table-inline-cell">
                    {editing ? (
                      <Select
                        {...TABLE_SELECT_PROPS}
                        aria-label={`Role for ${member.name}`}
                        value={role}
                        disabled={rowSaving}
                        onChange={(event) => void updateMember(member.id, { role: event.target.value })}
                      >
                        {roles.map((item) => (
                          <option key={item} value={item}>{roleLabel(item)}</option>
                        ))}
                      </Select>
                    ) : (
                      roleLabel(role)
                    )}
                  </td>
                  <td className="table-inline-cell">
                    {editing ? (
                      <Select
                        {...TABLE_SELECT_PROPS}
                        aria-label={`Access for ${member.name}`}
                        value={active ? '1' : '0'}
                        disabled={rowSaving}
                        onChange={(event) => void updateMember(member.id, { active: Number(event.target.value) })}
                      >
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                      </Select>
                    ) : (
                      <Badge tone={memberStatusTone(member)}>{memberStatusLabel(member)}</Badge>
                    )}
                  </td>
                  <td className="table-inline-cell">
                    {editing && active ? (
                      <Button
                        type="button"
                        className="secondary"
                        disabled={rowSaving}
                        onClick={() => void resetPassword(member)}
                      >
                        Reset password
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={TEAM_COLUMNS.length}>
                  <EmptyState>No team members found.</EmptyState>
                </td>
              </tr>
            )}
          </DataTable>
          {resetUrl && resetMemberName && (
            <div className="ui-form-grid" style={{ marginTop: 14 }}>
              <Field label={`Password reset link for ${resetMemberName}`}>
                <Input readOnly value={new URL(resetUrl, typeof window === 'undefined' ? 'https://millsaathi.com' : window.location.origin).toString()} />
              </Field>
              <FormActions>
                <Button className="secondary" type="button" onClick={() => void copyResetLink()}>Copy link</Button>
              </FormActions>
            </div>
          )}
        </TableCard>
      </section>
    </main>
  );
}
