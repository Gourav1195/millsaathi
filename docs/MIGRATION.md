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

When `DATABASE_URL` is set, the Node server hosts the existing proven route layer against the
PostgreSQL D1-compatibility adapter. This keeps all 72 existing routes, tenant predicates, RBAC,
money redaction, and batched stock-ledger transactions intact while the database transport moves.
Without `DATABASE_URL`, the opt-in Worker proxy remains available for local transition work.
Do not run both paths against writable production data: select one API origin at a time, validate
the PostgreSQL copy, then configure the final PostgreSQL provider through environment variables.

## PostgreSQL staging and import

`scripts/import-d1-to-postgres.mjs` imports a remote D1 SQL export into an empty PostgreSQL
database. It converts SQLite-only details (`NOCASE`, `BLOB`, timestamp defaults and identity
columns), restores indexes, and restores foreign keys after the data. The D1 export and all
connection strings remain under the git-ignored `work/` directory or in environment variables.
Run it only against an empty staging database:

```powershell
$env:DATABASE_URL = 'postgresql://…'
node scripts/import-d1-to-postgres.mjs work/d1-production-export.sql
node scripts/verify-postgres-import.mjs
node scripts/compare-d1-postgres.mjs work/d1-production-export.sql
```

If an import is interrupted after loading data, finish only its foreign keys with
`--add-foreign-keys`. To recreate a disposable staging database, `--reset` drops and recreates
its `public` schema before importing; it is intentionally explicit and must never be used on a
database containing anything to retain.

This creates a temporary data staging copy, not the final production deployment. Before cutover,
validate row counts, session/auth behavior, and stock-ledger totals against D1; do not point live
traffic at PostgreSQL merely because the import completes.
