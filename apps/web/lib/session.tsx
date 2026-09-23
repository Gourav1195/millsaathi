'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, json } from './api';
import { applyTheme, type Theme } from './theme';

export type Session = {
  id: string;
  name: string;
  role: string;
  role_label?: string;
  capabilities?: string[];
  theme?: Theme;
  preferred_unit?: string;
  mill: { id: string; name: string; season_label?: string };
};

type SessionContextValue = {
  session: Session | null | undefined;
  setSession: (session: Session | null) => void;
  sessionError: string | null;
  updateTheme: (theme: Theme) => Promise<void>;
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

  useEffect(() => {
    if (!session?.theme) return;
    applyTheme(session.theme);
  }, [session?.theme]);

  const updateTheme = useCallback(async (theme: Theme) => {
    const result = await api<{ theme: Theme }>('/api/auth/me', json('PATCH', { theme }));
    setSession((current) => current ? { ...current, theme: result.theme } : current);
    applyTheme(result.theme);
  }, []);

  return (
    <SessionContext.Provider value={{ session, setSession, sessionError, updateTheme }}>
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
