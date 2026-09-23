'use client';

import { useCallback, useEffect, useState } from 'react';

type DevStatus = {
  mode: string;
  worker_started_at: string;
  server_time: string;
  billing: {
    razorpay_configured: boolean;
    checkout_available: boolean;
    plan_starter: boolean;
    plan_professional: boolean;
  };
};

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

type RuntimeEnv = {
  port: string;
  onNextDev: boolean;
  onWorkerStatic: boolean;
};

export function DevIndicator() {
  const [status, setStatus] = useState<DevStatus | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [uiUpdatedAt, setUiUpdatedAt] = useState(() => new Date());
  const [hmrCount, setHmrCount] = useState(0);
  const [runtime, setRuntime] = useState<RuntimeEnv | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return;
    const port = window.location.port;
    setRuntime({
      port,
      onNextDev: port === '3000',
      onWorkerStatic: port === '8787',
    });
  }, []);

  const pingApi = useCallback(async () => {
    try {
      const response = await fetch('/api/dev/status', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Dev status unavailable');
      setStatus(body as DevStatus);
      setApiError(null);
    } catch (cause) {
      setStatus(null);
      setApiError(cause instanceof Error ? cause.message : 'API unreachable');
    }
  }, []);

  useEffect(() => {
    void pingApi();
    const timer = window.setInterval(() => { void pingApi(); }, 8000);
    return () => window.clearInterval(timer);
  }, [pingApi]);

  useEffect(() => {
    setUiUpdatedAt(new Date());
  }, [hmrCount]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const onHotUpdate = () => {
      setHmrCount((count) => count + 1);
      void pingApi();
    };

    const turbopackHot = import.meta.turbopackHot;
    if (turbopackHot) {
      turbopackHot.accept(onHotUpdate);
      return;
    }

    if (typeof module !== 'undefined') {
      const webpackHot = (module as { hot?: { accept: (callback: () => void) => void } }).hot;
      webpackHot?.accept(onHotUpdate);
    }
  }, [pingApi]);

  if (process.env.NODE_ENV !== 'development' || !runtime) return null;

  const { port, onNextDev, onWorkerStatic } = runtime;
  const surface = onNextDev ? 'Next dev :3000 (hot reload)' : onWorkerStatic ? 'Worker static :8787 (rebuild needed)' : `Local :${port || '80'}`;

  return (
    <div className="dev-indicator" role="status" aria-live="polite">
      <div className="dev-indicator-main">
        <span className={`dev-indicator-pill ${onNextDev ? 'ok' : 'warn'}`}>DEV</span>
        <span>{surface}</span>
        <span className="dev-indicator-sep">·</span>
        <span>UI {formatClock(uiUpdatedAt.toISOString())}{hmrCount > 0 ? ` · HMR x${hmrCount}` : ''}</span>
        <span className="dev-indicator-sep">·</span>
        <span>
          API {status ? `live ${formatClock(status.server_time)}` : apiError ? `offline (${apiError})` : 'checking…'}
        </span>
        {status && (
          <>
            <span className="dev-indicator-sep">·</span>
            <span>
              Worker since {formatClock(status.worker_started_at)}
              {status.billing.checkout_available ? ' · billing ready' : status.billing.razorpay_configured ? ' · add plan IDs' : ' · add Razorpay keys'}
            </span>
          </>
        )}
      </div>
      <div className="dev-indicator-actions">
        {!onNextDev && (
          <a className="dev-indicator-link" href="http://localhost:3000/app">Open :3000</a>
        )}
        <button type="button" className="dev-indicator-button" onClick={() => { void pingApi(); }}>Ping API</button>
        <button type="button" className="dev-indicator-button" onClick={() => window.location.reload()}>Hard reload</button>
      </div>
      {onWorkerStatic && (
        <p className="dev-indicator-note">
          You are on the static Worker bundle. React changes need <code>npm run build:web</code> or open <code>http://localhost:3000/app</code> instead.
        </p>
      )}
    </div>
  );
}
