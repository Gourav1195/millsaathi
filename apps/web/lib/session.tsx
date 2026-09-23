'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Session = { id: string; name: string; role: string; mill: { id: string; name: string } };

type SessionContextValue = {
  session: Session | null | undefined;
  setSession: (session: Session | null) => void;
  sessionError: string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          setSession(null);
          return;
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load session');
        setSession(body as Session);
      })
      .catch((cause: unknown) => {
        setSessionError(cause instanceof Error ? cause.message : 'Could not load session');
        setSession(null);
      });
  }, []);

  return (
    <SessionContext.Provider value={{ session, setSession, sessionError }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
