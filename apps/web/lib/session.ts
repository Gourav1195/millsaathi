'use client';

import { useEffect, useState } from 'react';

export type Session = { name: string; role: string; mill: { name: string } };

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);
  useEffect(() => {
    void fetch('/api/auth/me', { credentials: 'include' }).then(async (response) => {
      if (response.status === 401) { setSession(null); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load session');
      setSession(body as Session);
    }).catch((cause: unknown) => {
      setSessionError(cause instanceof Error ? cause.message : 'Could not load session');
      setSession(null);
    });
  }, []);
  return { session, setSession, sessionError };
}
