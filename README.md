# MillSaathi

Operations and ERP SaaS for India's rice mills — track every quintal from gate entry through
weighbridge, lab, and production, so the 2–6% that silently disappears becomes visible.
Sugar, flour, oil and dal mills to follow.

**Live → https://millsaathi.com**

Multi-tenant, deployed, and running entirely on the Cloudflare free tier — one Worker, one D1
database, no other services and no secrets.

| Surface | URL | What it is |
|---|---|---|
| Marketing site | `/` | Landing page |
| Real app | `/app` | Multi-tenant ERP: signup/login, gate & weighbridge, purchase/sales Saudās, stock ledger & lots, suppliers/buyers/items, processing, documents, team/RBAC, mass balance, night digest |
| API | `/api/*` | Hono JSON API on Workers + D1 |

## Demo logins

Seeded mill "Sri Venkatesh Rice Mill", password `demo1234`:

- `owner@demo.millsaathi.com` — sees everything
- `manager@demo.millsaathi.com` — money fields stripped server-side
- `accounts@demo.millsaathi.com` — payables/receivables view

Signing in as each shows the same screens with different data, which is the quickest way to see
how the permission model works.

## Architecture

A single Cloudflare Worker serves static assets from `public/` and the Hono API from `src/`,
backed by D1 (SQLite). The whole product — marketing site, demo, multi-tenant app, and API —
is one deployable unit. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the free-tier
capacity math; [docs/PRODUCT.md](docs/PRODUCT.md) has the market research and positioning.

### React + Cloudflare Worker migration (in progress)

The Worker remains the Hono API and D1 boundary while `apps/web` supplies the Next.js, React and
TypeScript frontend. The exported React app and the API deploy together on the same Worker, so
sessions stay same-origin and D1 remains a native binding. See [docs/MIGRATION.md](docs/MIGRATION.md)
for local commands and the route-porting approach.

### Decisions worth explaining

**Role-based redaction happens server-side.** Any API field whose name contains `paise` is
stripped from the response for the Manager role before it leaves the Worker. Hiding money in
the UI would still ship it over the wire; a mill manager opening devtools would see purchase
rates they're not meant to see.

**Integers only for weights and money.** Weights are stored as integer **kg** and rendered as
quintals (kg ÷ 100); money is integer **paise**. Float rounding on a 40-tonne consignment is
a real reconciliation problem, so the ambiguity is removed at the schema level.

**The business day is IST, always.** `istToday()` in `src/api.ts` pins the mill day regardless
of which Cloudflare edge location the Worker happens to execute in. A shift that starts at 6am
in Andhra Pradesh must not roll over because the request landed in a different timezone.

**The former vanilla-JavaScript demo and operational UI are retired from this deployment.** They
are retained separately in the sibling `millsaathi-legacy` folder, outside this repository.

## Develop

```sh
npm install
npm run db:migrate:local && npm run db:seed:local   # local D1
npm run dev                                          # API :8787 + Next hot reload :3000
npm run check                                        # tsc
```

`npm run dev` starts the Worker API and the Next.js dev server together. **Open
`http://localhost:3000/app` while editing React** — changes apply instantly without a hard refresh.
The Worker on `:8787` serves `/api/*`; Next proxies those calls in development.

Use `npm run dev:worker:static` only when you need to verify the production static export on
`:8787` (requires `npm run build:worker` first; no hot reload).

### Offline Processing test account

After the local migration and demo seed commands above, run `npm run dev` and open
`http://localhost:3000/app`. Use `owner@demo.millsaathi.com` with password `demo1234` as the
development test ID; it includes seeded stock lots and process data for testing the Processing
workspace without the hosted environment.

## Deploy

```sh
npm run db:migrate:remote   # only when migrations change
npm run deploy              # wrangler deploy → millsaathi.com
```

## MillSaathi AI Assistant

The **Need help?** button opens two tabs: a read-only AI assistant and human support.
The assistant is tool-first: it uses verified, mill-scoped tools to summarize stock and posted
production, retrieve relevant document metadata/notes with citations, and make a transparent
historical-average forecast. Gemini is used only for explanatory knowledge answers, never to
calculate or override operational numbers. It has no write tools and never gives a model direct
database access.

It works without an API key using local deterministic analysis. To enable Gemini, add Worker
secrets (the browser never receives the key):

```sh
wrangler secret put GEMINI_API_KEY
wrangler secret put GEMINI_MODEL  # optional; defaults to gemini-3-flash-preview
```

For local Wrangler development, put the same values in the ignored `.dev.vars` file. `.env` is
also ignored for local tooling that uses it. If Gemini is unavailable or rate-limited, the
assistant falls back to local analysis.
Uploaded file bytes are not included in provider requests; only selected document metadata and
notes can be used as retrieval context. The forecast uses up to 28 recent production days, with
the latest seven days weighted 2×, and labels confidence based on data depth. Add new
capabilities as read-only, mill-scoped tools in `src/ai.ts` before exposing any action to a model.

## Status

Currently **free** — ₹0, all shipped modules, unlimited users. Paid tiers are written but parked in
an HTML comment in `public/index.html`, and stay parked until a payment gateway is actually wired up.

Deliberate follow-ups:

- Turnstile is optional and wired into login/signup; production still needs the site-key variable and `wrangler secret put TURNSTILE_SECRET_KEY` configuration.
- Party CSV/XLSX import is bounded, previewed, and validated in the browser before commit.
- Cloudflare account-level managed bot/AI crawler controls still need to be enabled in the production dashboard.
- GST/e-invoice/IRN integration and SaaS subscription checkout are future integrations; operational documents and billing-boundary tables are separate. Each mill is provisioned with a read-only free billing status record so checkout can be added without coupling it to operational payments.
- Posted gate weights are immutable after stock/fulfilment synchronization; corrections should be recorded as a separate operational adjustment.
- Posted processing runs can be voided with the `VOID` permission; stock movements are reversed and source lots restored without deleting run history.
- Owners and admins can either create active team accounts directly or issue seven-day shareable invite links; credentials are hashed server-side and team changes are audited.
