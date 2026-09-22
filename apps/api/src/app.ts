import { Hono } from 'hono';
import { createPostgresPool } from './postgres.js';

type NodeApiOptions = { workerApiOrigin?: string };

function proxyHeaders(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  return headers;
}

/**
 * Transitional Node API. Put native Node routes above the catch-all proxy as they are ported.
 * The proxy is intentionally opt-in so an unconfigured Node server never accidentally sends
 * tenant cookies or operational data to an unknown host.
 */
export function createApp({ workerApiOrigin }: NodeApiOptions = {}) {
  const app = new Hono();
  const upstream = workerApiOrigin ? new URL(workerApiOrigin) : null;
  const postgres = createPostgresPool();

  app.get('/health', (c) => c.json({ ok: true, service: 'millsaathi-api', workerProxy: Boolean(upstream), postgresConfigured: Boolean(postgres) }));
  app.get('/api/health', (c) => c.json({ ok: true, service: 'millsaathi-api', workerProxy: Boolean(upstream), postgresConfigured: Boolean(postgres) }));

  app.all('/api/*', async (c) => {
    if (!upstream) return c.json({ error: 'Node API is not configured with WORKER_API_ORIGIN.' }, 501);
    const incoming = new URL(c.req.url);
    const target = new URL(`${incoming.pathname}${incoming.search}`, upstream);
    const method = c.req.method;
    const response = await fetch(target, {
      method,
      headers: proxyHeaders(c.req.raw),
      body: method === 'GET' || method === 'HEAD' ? undefined : c.req.raw.body,
      redirect: 'manual',
      // Node's fetch needs this when passing through a streaming request body.
      // @ts-expect-error This undici extension is available in Node's fetch implementation.
      duplex: 'half',
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  });
  return app;
}
