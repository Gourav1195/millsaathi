'use client';

import { FormEvent, useState } from 'react';
import type { Session } from '../lib/session';
import { Button, Field, FormActions, FormGrid, Input, Panel } from './ui';

export function PasswordChangeApp({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError('Choose a new password of at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not update password');
      const me = await fetch('/api/auth/me', { credentials: 'include' });
      const session = await me.json();
      if (!me.ok) throw new Error(session.error ?? 'Could not open your workspace');
      onSuccess(session as Session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update password');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/app';
  }

  return (
    <main className="auth-page">
      <Panel title="Choose a new password" className="auth-card">
        <p className="muted" style={{ marginBottom: 16 }}>
          Your account was created with a temporary password. Set your own password before continuing.
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <FormGrid onSubmit={submit}>
          <Field label="Current password">
            <Input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="New password">
            <Input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <FormActions>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save new password'}</Button>
            <Button type="button" className="quiet" onClick={() => void logout()}>Log out</Button>
          </FormActions>
        </FormGrid>
      </Panel>
    </main>
  );
}
