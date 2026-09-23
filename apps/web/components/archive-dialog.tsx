'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from './ui';

export type ArchiveDialogRequest = {
  title?: string;
  name: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};

type ArchiveDialogContextValue = {
  requestArchive: (request: ArchiveDialogRequest) => void;
};

const ArchiveDialogContext = createContext<ArchiveDialogContextValue | null>(null);

const DEFAULT_DESCRIPTION =
  'This record will be removed from active lists. Historical agreements, gate entries, and payments are kept.';

export function ArchiveDialogProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<ArchiveDialogRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  const close = useCallback(() => {
    if (busy) return;
    setRequest(null);
    setError(null);
  }, [busy]);

  const requestArchive = useCallback((next: ArchiveDialogRequest) => {
    setError(null);
    setRequest(next);
  }, []);

  async function confirm() {
    if (!request || busy) return;
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm();
      setRequest(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive record');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ArchiveDialogContext.Provider value={{ requestArchive }}>
      {children}
      <dialog
        ref={dialogRef}
        className="app-dialog archive-dialog"
        onClose={() => {
          if (!busy) {
            setRequest(null);
            setError(null);
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        {request ? (
          <>
            <div className="app-dialog-head">
              <div>
                <h2>{request.title ?? 'Archive record?'}</h2>
                <p>
                  <strong>{request.name}</strong> {request.description ?? DEFAULT_DESCRIPTION}
                </p>
              </div>
              <button
                type="button"
                className="app-dialog-close ms-focus-ring"
                aria-label="Close archive dialog"
                onClick={close}
                disabled={busy}
              >
                ×
              </button>
            </div>
            {error ? <p className="error app-dialog-error">{error}</p> : null}
            <div className="app-dialog-actions">
              <Button type="button" className="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" className="danger" onClick={() => void confirm()} disabled={busy}>
                {busy ? 'Archiving…' : request.confirmLabel ?? 'Archive'}
              </Button>
            </div>
          </>
        ) : null}
      </dialog>
    </ArchiveDialogContext.Provider>
  );
}

export function useArchiveDialog() {
  const context = useContext(ArchiveDialogContext);
  if (!context) throw new Error('useArchiveDialog must be used within ArchiveDialogProvider');
  return context;
}
