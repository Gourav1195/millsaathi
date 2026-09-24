'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppLink } from './app-link';
import { AppHeader } from './app-header';
import { Alert, Button } from './ui';
import { can } from '../lib/permissions';
import { useSession } from '../lib/session';
import { CatalogProcessType, ProcessCatalog } from './process-catalog';
import { ProcessChainClassic } from './process-chain-classic';
import { ProcessChainStudio } from './process-chain-studio';

type ChainViewMode = 'classic' | 'studio';
type ProcessingChain = { id: string; name: string; description?: string | null; steps: { id: string; process_type_id: string; step_number: number; process_type_name?: string; process_type_description?: string | null; notes?: string | null }[] };

export function ProcessingApp() {
  const { session, sessionError } = useSession();
  const [chainMode, setChainMode] = useState<ChainViewMode>('classic');
  const [error, setError] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editorTypeId, setEditorTypeId] = useState<string | null>(null);
  const [catalogTypes, setCatalogTypes] = useState<CatalogProcessType[]>([]);
  const [chains, setChains] = useState<ProcessingChain[]>([]);

  const canManageOrg = can(session, 'processing:configure');
  const canStartChainRun = can(session, 'processing:create');

  const loadTypes = async () => {
    const response = await fetch('/api/process-types?include_archived=1', { credentials: 'include' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Could not load process types');
    const allTypes = body.process_types as CatalogProcessType[];
    setCatalogTypes(allTypes);
  };

  useEffect(() => {
    if (!session) return;
    void loadTypes().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load Processing'));
  }, [session]);

  const loadChains = useCallback(async () => {
    const response = await fetch('/api/processing-chains', { credentials: 'include' });
    const body = await response.json() as { chains?: ProcessingChain[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Could not load processing chains');
    setChains(body.chains ?? []);
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadChains().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load processing chains'));
  }, [session, loadChains]);

  if (session === undefined) return <main className="auth-page"><p className="muted">Checking your MillSaathi session…</p></main>;
  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Sign in required</h1>
          <p className="muted">Log in before opening Processing.</p>
          {sessionError ? <p className="error">{sessionError}</p> : null}
          <AppLink className="primary" href="/app">Go to login</AppLink>
        </div>
      </main>
    );
  }

  const today = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());

  return (
    <main className="shell">
      <AppHeader session={session} />
      <section className="workspace">
        <div className="toolbar processing-topbar">
          <div>
            <h2>Processing</h2>
            <p className="muted">Transform inputs into traceable outputs</p>
          </div>
          <div className="processing-tabs processing-chain-mode-tabs" role="tablist" aria-label="Processing view">
            <button type="button" role="tab" aria-selected={chainMode === 'classic'} className={chainMode === 'classic' ? 'selected' : ''} onClick={() => setChainMode('classic')}>Classic view</button>
            <button type="button" role="tab" aria-selected={chainMode === 'studio'} className={chainMode === 'studio' ? 'selected' : ''} onClick={() => setChainMode('studio')}>Studio view</button>
          </div>
          <div className="processing-date">
            <strong>{today}</strong>
            <small>Kharif season</small>
          </div>
        </div>

        {canManageOrg && (
          <div className="process-toolbar">
            <div className="process-toolbar-actions">
              <Button type="button" className="quiet" onClick={() => setCatalogOpen(true)}>
                All processes
              </Button>
            </div>
          </div>
        )}

        {canManageOrg && (
          <ProcessCatalog
            open={catalogOpen}
            onClose={() => setCatalogOpen(false)}
            editorTypeId={editorTypeId}
            onEditorTypeIdChange={setEditorTypeId}
            types={catalogTypes}
            preferredUnit={session.preferred_unit ?? 'QUINTAL'}
            onChanged={loadTypes}
          />
        )}

        {error && <Alert title="Processing error" level="red">{error}</Alert>}

        {chainMode === 'classic' ? (
          <ProcessChainClassic
            chains={chains}
            types={catalogTypes}
            preferredUnit={session.preferred_unit ?? 'QUINTAL'}
            canStartRun={canStartChainRun}
            onError={setError}
          />
        ) : (
          <ProcessChainStudio
            chains={chains}
            types={catalogTypes}
            canManage={canManageOrg}
            onChainsChange={loadChains}
            onError={setError}
          />
        )}
      </section>
    </main>
  );
}
