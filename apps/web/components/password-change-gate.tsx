'use client';

import type { ReactNode } from 'react';
import { useSession } from '../lib/session';
import { PasswordChangeApp } from './password-change-app';

export function PasswordChangeGate({ children }: { children: ReactNode }) {
  const { session, setSession } = useSession();
  if (!session?.must_change_password) return <>{children}</>;
  return <PasswordChangeApp onSuccess={setSession} />;
}
