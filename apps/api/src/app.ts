import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { PostgresD1Database } from './d1-postgres.js';
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
export async function createApp({ workerApiOrigin }: NodeApiOptions = {}) {
  const app = new Hono();
  const upstream = workerApiOrigin ? new URL(workerApiOrigin) : null;
  const postgres = createPostgresPool();
  const nativeDatabase = postgres ? new PostgresD1Database(postgres) : null;
  // Reuse the proven route layer while the transport and database move to Node/PostgreSQL.
  // The module URL is deliberately computed so the Node workspace type-check stays isolated
  // from Worker-specific ambient types; tsx resolves it at runtime.
  const subtle = globalThis.crypto.subtle as unknown as { timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean };
  if (!subtle.timingSafeEqual) {
    subtle.timingSafeEqual = (left, right) => timingSafeEqual(Buffer.from(left), Buffer.from(right));
  }
  const workerApi = nativeDatabase
    ? (await import(new URL('../../../src/index.ts', import.meta.url).href)).default
    : null;

  app.get('/health', (c) => c.json({ ok: true, service: 'millsaathi-api', workerProxy: Boolean(upstream), postgresConfigured: Boolean(postgres) }));
  app.get('/api/health', (c) => c.json({ ok: true, service: 'millsaathi-api', workerProxy: Boolean(upstream), postgresConfigured: Boolean(postgres) }));

  app.all('/api/*', async (c) => {
    if (workerApi && nativeDatabase) {
      return workerApi.fetch(c.req.raw, {
        DB: nativeDatabase,
        TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
        TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL,
      });
    }
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
