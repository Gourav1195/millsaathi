# MillSaathi

Operations and ERP SaaS for India's rice mills — track every quintal from gate entry through
weighbridge, lab, and production, so the 2–6% that silently disappears becomes visible.
Sugar, flour, oil and dal mills to follow.

**Live → https://millsaathi.com** · **Try it with no signup → https://millsaathi.com/demo**

Multi-tenant, deployed, and running entirely on the Cloudflare free tier — one Worker, one D1
database, no other services and no secrets.

| Surface | URL | What it is |
|---|---|---|
| Marketing site | `/` | Landing page |
| Demo mill | `/demo` | Full interactive dashboard, client-side data, no login — the sales tool |
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

**`/demo` needs no backend.** The demo mill runs on client-side data, so a prospect (or an
interviewer) always sees a working product — no login, no cold start, nothing to break.

## Develop

```sh
npm install
npm run db:migrate:local && npm run db:seed:local   # local D1
npm run dev                                          # wrangler dev on :8787
npm run check                                        # tsc
```

## Deploy

```sh
npm run db:migrate:remote   # only when migrations change
npm run deploy              # wrangler deploy → millsaathi.com
```

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
