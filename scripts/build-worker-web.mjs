import { cp, mkdir, rm } from 'node:fs/promises';

const output = 'dist/web';

// Keep the existing marketing/demo assets, then overlay the exported React application so
// /app and its route surfaces are served by the same Worker as the native Hono API.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp('public', output, { recursive: true });
// Keep the old operational UI reachable until its remaining create/edit/void forms have React
// parity. It uses the same same-origin Worker API and session cookie.
await cp('public/app', `${output}/legacy-app`, { recursive: true });
await cp('apps/web/out', output, { recursive: true, force: true });
