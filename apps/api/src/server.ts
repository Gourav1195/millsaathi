import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8788);
const app = createApp({ workerApiOrigin: process.env.WORKER_API_ORIGIN });
serve({ fetch: app.fetch, port });
console.log(`MillSaathi Node API listening on http://127.0.0.1:${port}${process.env.WORKER_API_ORIGIN ? ` → ${process.env.WORKER_API_ORIGIN}` : ''}`);
