'use client';

import { AppHeader } from './app-header';
import { PageHeader, Panel } from './ui';
import { groupCapabilitiesForDisplay, ROLE_LABELS, type Capability } from '../lib/permissions';
import { useSession } from '../lib/session';

export function AccessApp() {
  const { session, sessionError } = useSession();
  if (sessionError) return <main className="shell"><p className="error">{sessionError}</p></main>;
  if (!session) return <main className="shell"><p className="muted">Loading session…</p></main>;

  const role = session.role_label ?? ROLE_LABELS[session.role as keyof typeof ROLE_LABELS] ?? session.role;
  const caps = (session.capabilities ?? []) as Capability[];
  const grouped = groupCapabilitiesForDisplay(caps);

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <PageHeader title="My access" subtitle="This summary reflects the permissions enforced by the server for your account." />
        <Panel>
          <p><strong>Role:</strong> {role}</p>
          <p className="muted">Permissions are fixed by role in V1. Contact an owner or admin if you need a different role.</p>
        </Panel>
        <div className="form-grid two-col" style={{ marginTop: 20 }}>
          <Panel title="Can view">
            {grouped.view.length ? (
              <ul>{grouped.view.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : (
              <p className="muted">No view modules assigned.</p>
            )}
          </Panel>
          <Panel title="Can edit or manage">
            {grouped.manage.length ? (
              <ul>{grouped.manage.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : (
              <p className="muted">Read-only access for business changes.</p>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
}
