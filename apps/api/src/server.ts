import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'millsaathi-api' }));
app.all('/api/*', (c) => c.json({ error: 'This Node API route has not been ported from the Worker yet.' }, 501));

const port = Number(process.env.PORT ?? 8788);
serve({ fetch: app.fetch, port });
console.log(`MillSaathi Node API listening on http://127.0.0.1:${port}`);
