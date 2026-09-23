# React and Cloudflare Worker migration

The repository is now an npm workspace. The original Cloudflare Worker remains the Hono API and
the Cloudflare-native D1 client, while the app routes move to Next.js/React. This avoids a
high-risk rewrite of the tenant, stock-ledger, and authorization logic in one release.

| Workspace | Purpose | Local command |
|---|---|---|
| `apps/web` | Next.js + React + TypeScript UI | `npm run dev:web` |
| root `src/` | Existing Cloudflare Worker API | `npm run dev:worker` |

`npm run dev` starts both processes: the Worker API on `:8787` and Next.js with hot reload on
`:3000`. Open `http://localhost:3000/app` while editing `apps/web`; Next proxies `/api/*` to the
Worker in development. Use `npm run dev:worker:static` only to verify the exported bundle on
`:8787` (no hot reload — rebuild with `npm run build:worker` after UI changes).

In production, the Worker serves the exported Next application and its `/api/*` routes on the
same origin; no database URL or Cloudflare API token is required at runtime.

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
| `/app/gate` | `components/gate-app.tsx` | overview, gate | entry + controlled weighment |
| `/app/purchase` | `components/purchase-app.tsx` | overview, saudas, sauda deliveries | create/status/manual delivery |
| `/app/parties` | `components/parties-app.tsx` | overview, masters, payments | create/archive/payment |
| `/app/items` | `components/items-app.tsx` | overview, masters | create/edit |
| `/app/stock` | `components/stock-app.tsx` | overview, lots | search + controlled lot adjustments |
| `/app/team` | `components/team-app.tsx` | team | accounts, invites, role and activation management |
| `/app/documents` | `components/documents-app.tsx` | documents, overview | create/upload/void/download/print |
| `/app/billing` | `components/billing-app.tsx` | billing status | read-only |
| `/app/digest` | `components/digest-app.tsx` | digest | read-only/share |

`lib/session.ts` owns browser-side session lookup, and `components/app-header.tsx` owns the
authenticated navigation. Add new screens through the same pattern. Avoid copying the old
monolithic dashboard renderer into React: extract a focused API type and a focused screen instead.

Compatibility aliases `/app/suppliers`, `/app/buyers`, and `/app/processing` redirect to their
new React counterparts. The support-only bug-report queue is intentionally not exposed in the
main navigation; it must stay permission-gated when it is migrated.

## Backend migration contract

The deployed Hono API runs natively in the Cloudflare Worker and uses the existing `DB` D1
binding. All 72 routes retain their tenant predicates, RBAC, money redaction, binary document
uploads, and batched stock-ledger transactions. D1 bindings carry the necessary authority inside
the Worker, so no `CLOUDFLARE_API_TOKEN`, `DATABASE_URL`, external Node server, or transition
proxy is required.

`npm run build:worker` produces `dist/web` by preserving the marketing assets and overlaying the
static Next export. The former vanilla-JavaScript operational UI and its demo have been moved to
the sibling `millsaathi-legacy` folder and are no longer deployed by this Worker. `npm run deploy`
builds that bundle and deploys the Worker.
