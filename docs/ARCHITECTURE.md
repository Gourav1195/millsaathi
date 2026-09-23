# MillSaathi — Architecture (V1, Cloudflare free tier)

Hard constraint: **₹0 infrastructure until revenue.** Everything below fits Cloudflare's free plan
on account `ef20ae515dd30180aeeebf45259f03a5`. Pay-per-use features are plan-gated with hard caps
so a bug or abuse can never create a surprise bill.

## Stack

| Layer | Choice | Free-tier limit | Why it holds |
|---|---|---|---|
| Compute + hosting | **One Worker** (`millsaathi`) with Static Assets | 100k req/day, 10 ms CPU | A busy mill ≈ 60 weighments/day ≈ a few hundred API calls. 100+ mills fit. Static assets are unlimited & free. |
| Database | **D1** (SQLite) | 5 GB, 5 M row reads/day, 100k row writes/day | Row-lean schema; a mill writes < 1k rows/day. |
| Sessions | D1 table (hashed tokens) | — | No KV needed; one indexed read per request. |
| Files (V2) | R2 | 10 GB free | Slip PDFs, lot photos. |
| Bot protection | Turnstile on login/signup | free | |
| Digest computation | On-demand Worker route | free | Night Digest is computed when requested; no scheduled trigger is required in V1. |

Deliberately **not** used in V1: Queues (paid), Durable Objects (only needed for live-gate
websockets — V2), Hyperdrive, external SaaS (auth, email) — all replaced by in-Worker code.

## Layout

```
millsaathi/
  wrangler.jsonc          # config: assets + D1 + observability
  src/index.ts            # Hono app: API + auth + role guards
  public/                 # static assets: landing, /demo, /app SPA
  migrations/             # D1 migrations (wrangler d1 migrations apply)
  docs/
```

Routing: static assets serve first; `run_worker_first` for `/api/*` and `/app*` (session check).
`/` is the landing page and `/app` is the React application with `/api/*` JSON. The former
vanilla-JavaScript operational UI and demo are retained outside this repository in the sibling
`millsaathi-legacy` folder and are not part of this deployment.

## Multi-tenancy & roles

- Every business table carries `mill_id`; every query is scoped by the session's mill. No
  cross-tenant query paths exist; route-level authorization and explicit tenant predicates protect
  both reads and writes.
- Roles: `owner`, `admin`, `manager`, `accountant`, `gate_operator`, `production_operator`, and
  `viewer` (with legacy `operator` compatibility). Permissions cover view/create/edit/void/export,
  member management, and organisation management.
- **Manager never receives money fields** — rates, values, outstandings are stripped server-side,
  not hidden client-side. Managers can operate permitted workflows and create documents, but cannot
  manage team membership or commercial Saudās.

## Auth (zero-cost, no third party)

- Email + password. PBKDF2-SHA-256, 100k iterations, 16-byte random salt (WebCrypto).
- Session token: 32 random bytes; only its SHA-256 hash stored in D1; HttpOnly, Secure,
  SameSite=Lax cookie; 30-day sliding expiry.
- Signup creates mill + owner atomically (D1 batch).

## Money & quantities

- Money stored as **integer paise**; quantities as **integer kg** (display in quintals = kg/100).
  No floats in the ledger.

## Domain extensions

The current operational surface also includes generic item categories and normalized stock
movements, explicit base/display/package units, optional godown capacity, Sauda agreement records
with multiple actual deliveries, broker commission, soft-delete/archive fields, audit events,
business documents, gate/lot quality metadata (moisture, broken %, foreign matter %, damaged %, and grade), and multi-line process runs. Legacy paddy/rice daily production remains as a
rice-mill-specific dashboard view; generic movement summaries power cross-item stock and flow views.

## Mass balance (the moat)

`production_runs` records paddy consumed vs rice/bran/husk/broken produced per day.
`unexplained_pct = (in − Σout) / in`. Dashboard compares against `mills.loss_limit_pct`
(owner-set, default 3%) and raises the red alert exactly like the design. The Night Digest route
computes its summary on demand, which keeps V1 free of scheduled infrastructure and stale rows.

Posted process runs are reversible through an explicit void operation. Their stock movements are
marked `VOID`, consumed source-lot quantities are restored, and output lots that have not flowed
downstream are cleared; the process run and audit event remain in the database. Completed gate
weights are immutable after posting so stock and Sauda fulfilment cannot silently drift.
Process `LOSS` lines remain in the mass-balance history but do not create inventory movements;
only inputs consume stock and outputs create stock.

## Processing chains

`processing_chains` and ordered `processing_chain_steps` provide an optional, linear routing
layer above reusable process types. A `processing_chain_run` is a work order whose individual
`process_runs` retain `chain_run_id` and `chain_step_id`. Standalone process runs keep both
columns `NULL` and behave exactly as before.

Advancing a chain posts the current step using the existing stock and lot ledger. From step two
on, its input lots must be output lots from the immediately previous chain step, so intermediate
work-in-progress stays traceable. Chain detail calculates end-to-end input, final main output,
by-products, measured loss, unexplained quantity, and per-step yields. Voiding a chain reverses
its posted process runs in reverse order, provided no output lot has left the chain.

## Plan gating & bill safety (V2-ready)

**Today there is no paid billing and no plan gating.** Every mill gets every module free; `mills.plan` is
retained as internal metadata only and is never rendered in the UI. A separate `billing_accounts`
record is provisioned for each new mill and backfilled for existing mills, while
`/api/billing/status` remains a read-only free-status surface. Do not gate a feature on billing
without also restoring the parked pricing section in `public/index.html` and implementing checkout.

- `mills.plan`: `trial | starter | professional | enterprise` (unused for entitlement).
- Pay-per-use features (WhatsApp API digest, SMS) live behind a per-mill **monthly usage counter
  in D1 with a hard cap**; when the cap is hit the feature degrades to the free path
  (in-app digest + wa.me link). We never call a paid API without decrementing an allowance first.
  The shipped digest already *is* the free path, so V1 has no metered API calls at all.

## Scale-up path (V2, funded by revenue)

Workers Paid ($5/mo) → 30 s CPU + unlimited requests; D1 paid → 10 GB+; Durable Objects for live
gate queue; Queues for digest fan-out; R2 for documents. No re-architecture required — same code.
