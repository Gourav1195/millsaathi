'use client';

import { AppLink } from './app-link';
import { FormEvent, useEffect, useRef, useState } from 'react';
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
import { TableEditCell, TableEditModeButton } from './table-edit-mode';
import { millHeaderMeta } from '../lib/app-meta';
import { can } from '../lib/permissions';
import { useTableEditMode, withEditModeColumns } from '../lib/table-edit-mode';
import { useSession } from '../lib/session';
import { api, json } from '../lib/api';

type Member = { id: string; name: string; email: string; role?: string; role_code?: string; active?: number | boolean; preferred_unit?: string };
type AccountForm = { name: string; email: string; role: string; password: string };

const roles = ['admin', 'manager', 'accountant', 'gate_operator', 'production_operator', 'viewer'];
const emptyAccount = (): AccountForm => ({ name: '', email: '', role: 'viewer', password: '' });

const TEAM_COLUMNS_BASE = [
  { id: 'member', label: 'Member' },
  { id: 'email', label: 'Email' },
  { id: 'role', label: 'Role' },
  { id: 'status', label: 'Status' },
  { id: 'unit', label: 'Preferred unit' },
];

export function TeamApp() {
  const { session, sessionError } = useSession();
  const headerMeta = millHeaderMeta(session);
  const [members, setMembers] = useState<Member[]>([]);
  const [mode, setMode] = useState<'account' | 'invite'>('account');
  const [form, setForm] = useState<AccountForm>(emptyAccount);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState<Member | null>(null);
  const [manageForm, setManageForm] = useState({ role: 'viewer', active: '1' });
  const manageDialogRef = useRef<HTMLDialogElement>(null);
  const tableEdit = useTableEditMode();

  const load = async () => setMembers((await api<{ members: Member[] }>('/api/team')).members);
  useEffect(() => {
    if (session) void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load team'));
  }, [session]);

  const canManage = can(session, 'team:manage');

  useEffect(() => {
    const dialog = manageDialogRef.current;
    if (!dialog) return;
    if (managing && !dialog.open) dialog.showModal();
    if (!managing && dialog.open) dialog.close();
  }, [managing]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || (mode === 'account' && form.password.length < 8)) {
      setError(mode === 'account' ? 'Enter a name, valid email, and a password of at least 8 characters.' : 'Enter a name and valid email.');
      return;
    }
    setSaving(true);
    setError(null);
    setInviteUrl(null);
    try {
      if (mode === 'account') {
        await api('/api/team/account', json('POST', { ...form, name: form.name.trim(), email: form.email.trim() }));
      } else {
        const result = await api<{ invite_url: string }>('/api/team/invite', json('POST', { name: form.name.trim(), email: form.email.trim(), role: form.role }));
        setInviteUrl(result.invite_url);
      }
      setForm(emptyAccount());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save team member');
    } finally {
      setSaving(false);
    }
  }

  function startManage(member: Member) {
    const role = member.role_code ?? member.role ?? 'viewer';
    const active = !(member.active === false || member.active === 0);
    setManaging(member);
    setManageForm({ role, active: active ? '1' : '0' });
  }

  async function saveManage(event: FormEvent) {
    event.preventDefault();
    if (!managing) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/team/${managing.id}`, json('PATCH', { role: manageForm.role, active: Number(manageForm.active) }));
      setManaging(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update team member');
    } finally {
      setSaving(false);
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
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <TableEditModeButton
                enabled={canManage}
                editMode={tableEdit.editMode}
                onToggle={tableEdit.toggleEditMode}
              />
              <AppLink href="/app/dashboard"><Button className="quiet">Dashboard</Button></AppLink>
            </div>
          }
        />

        {error && <Alert title="Action failed" level="red">{error}</Alert>}

        {canManage && (
          <Panel
            title={mode === 'account' ? 'Create active account' : 'Invite a team member'}
            actions={
              <TabRow>
                <Tab selected={mode === 'account'} onClick={() => setMode('account')}>Create account</Tab>
                <Tab selected={mode === 'invite'} onClick={() => setMode('invite')}>Invite link</Tab>
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
                  {roles.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}
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
            {inviteUrl && (
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

        <dialog
          ref={manageDialogRef}
          className="app-dialog"
          onClose={() => {
            if (!saving) setManaging(null);
          }}
          onCancel={(event) => {
            event.preventDefault();
            if (!saving) setManaging(null);
          }}
        >
          {managing ? (
            <>
              <div className="app-dialog-head">
                <div>
                  <h2>Manage {managing.name}</h2>
                  <p><strong>{managing.email}</strong></p>
                </div>
                <button
                  type="button"
                  className="app-dialog-close ms-focus-ring"
                  aria-label="Close manage member dialog"
                  onClick={() => setManaging(null)}
                  disabled={saving}
                >
                  ×
                </button>
              </div>
              <FormGrid className="ui-form-grid--compact" onSubmit={saveManage}>
                <Field label="Role">
                  <Select value={manageForm.role} onChange={(e) => setManageForm({ ...manageForm, role: e.target.value })}>
                    {roles.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                  </Select>
                </Field>
                <Field label="Access">
                  <Select value={manageForm.active} onChange={(e) => setManageForm({ ...manageForm, active: e.target.value })}>
                    <option value="1">Active</option>
                    <option value="0">Deactivate access</option>
                  </Select>
                </Field>
                <FormActions>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save access'}</Button>
                  <Button className="secondary" type="button" onClick={() => setManaging(null)} disabled={saving}>Cancel</Button>
                </FormActions>
              </FormGrid>
            </>
          ) : null}
        </dialog>

        <TableCard title="Team members" subtitle={`${members.length} member${members.length === 1 ? '' : 's'}`}>
          <DataTable columns={withEditModeColumns(TEAM_COLUMNS_BASE, tableEdit.editMode, { canEdit: canManage })}>
            {members.length ? members.map((member) => {
              const active = !(member.active === false || member.active === 0);
              const role = member.role_code ?? member.role ?? 'viewer';
              const self = member.id === session.id;
              const manageable = canManage && !self && role !== 'owner';
              return (
                <tr key={member.id}>
                  {tableEdit.editMode && canManage && (
                    manageable
                      ? <TableEditCell label={member.name} onClick={() => startManage(member)} />
                      : <td className="table-edit-col" />
                  )}
                  <td><strong>{member.name}</strong></td>
                  <td>{member.email}</td>
                  <td>{role.replaceAll('_', ' ')}</td>
                  <td>
                    <Badge tone={active ? 'success' : 'danger'}>{active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td>{member.preferred_unit ?? '—'}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={withEditModeColumns(TEAM_COLUMNS_BASE, tableEdit.editMode, { canEdit: canManage }).length}><EmptyState>No team members found.</EmptyState></td>
              </tr>
            )}
          </DataTable>
        </TableCard>
      </section>
    </main>
  );
}
