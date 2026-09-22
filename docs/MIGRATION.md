# React and Node migration

The repository is now an npm workspace, with the original Worker retained as the production API
while routes move incrementally to a Node Hono server. This avoids a high-risk rewrite of the
tenant, stock-ledger, and authorization logic in one release.

| Workspace | Purpose | Local command |
|---|---|---|
| `apps/web` | Next.js + React + TypeScript UI | `npm run dev:web` |
| `apps/api` | New Node.js + Hono API boundary | `npm run dev:api` |
| root `src/` | Existing Cloudflare Worker API | `npm run dev:worker` |

Start the Worker on `:8787` and Next on `:3000`. The Node API can bridge the existing Worker
contract while routes move natively: set `WORKER_API_ORIGIN=http://127.0.0.1:8787` before
`npm run dev:api`, then set `API_ORIGIN=http://127.0.0.1:8788` before `npm run dev:web`.
Browser cookies remain same-origin from the React app's point of view. The bridge is intended for
local migration work, not production; it must not become the production proxy before trusted
client-IP/rate-limit forwarding is designed.

The first migrated surface is `/app`: the Processing workspace uses React state, `@dnd-kit/core`
for drag and drop, and `@xyflow/react` for an extensible processing-chain canvas. It reads the
existing Worker endpoints and does not alter stock until the operator posts a run.

## Frontend route map

Keep each product area as its own Next route and component. Shared UI or browser state belongs in
`apps/web/components/` and `apps/web/lib/`; a page should only compose a screen.

| Next route | Component | Current API source | Migration status |
|---|---|---|---|
| `/app` | `components/processing-app.tsx` | process workspace, process types, chains, process runs | interactive |
| `/app/dashboard` | `components/dashboard-app.tsx` | overview | read-only |
| `/app/gate` | `components/gate-app.tsx` | overview | read-only |
| `/app/purchase` | `components/purchase-app.tsx` | overview | read-only |
| `/app/parties` | `components/parties-app.tsx` | overview | read-only |
| `/app/items` | `components/items-app.tsx` | overview | read-only |
| `/app/stock` | `components/stock-app.tsx` | overview | read-only |
| `/app/team` | `components/team-app.tsx` | team | read-only |
| `/app/documents` | `components/documents-app.tsx` | documents | read-only |
| `/app/billing` | `components/billing-app.tsx` | billing status | read-only |
| `/app/digest` | `components/digest-app.tsx` | digest | read-only/share |

`lib/session.ts` owns browser-side session lookup, and `components/app-header.tsx` owns the
authenticated navigation. Add new screens through the same pattern. Avoid copying the old
monolithic dashboard renderer into React: extract a focused API type and a focused screen instead.

Compatibility aliases `/app/suppliers`, `/app/buyers`, and `/app/processing` redirect to their
new React counterparts. The support-only bug-report queue is intentionally not exposed in the
main navigation; it must stay permission-gated when it is migrated.

## Backend migration contract

The Worker contains 72 API routes. Native Node routes must be placed above the transitional
`/api/*` proxy in `apps/api/src/app.ts`, and only replace the proxy after the relevant contract is
ported and verified. Port in this order: authentication/session lookup, read-only organisation and
catalogue endpoints, then writes, then stock/processing transactions. Never split a stock-ledger
transaction across the Worker and Node. Before production cutover, choose and configure a Node
database adapter that preserves D1's tenant-scoped queries and transactional batches; this requires
environment credentials and is intentionally not guessed in source control.
