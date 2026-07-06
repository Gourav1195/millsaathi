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
| Cron | Worker cron trigger | free | Nightly digest computation. |

Deliberately **not** used in V1: Queues (paid), Durable Objects (only needed for live-gate
websockets — V2), Hyperdrive, external SaaS (auth, email) — all replaced by in-Worker code.

## Layout

```
millsaathi/
  wrangler.jsonc          # config: assets + D1 + observability + cron
  src/index.ts            # Hono app: API + auth + role guards
  public/                 # static assets: landing, /demo, /app SPA
  migrations/             # D1 migrations (wrangler d1 migrations apply)
  docs/
```

Routing: static assets serve first; `run_worker_first` for `/api/*` and `/app*` (session check).
`/` landing, `/demo` demo SPA (client-side data, zero backend cost), `/app` real SPA + `/api/*` JSON.

## Multi-tenancy & roles

- Every business table carries `mill_id`; every query is scoped by the session's mill. No
  cross-tenant query paths exist (single query helper enforces the `mill_id` predicate).
- Roles: `owner`, `manager`, `accountant` (+ `operator` reserved for the Android app).
  **Manager never receives money fields** — rates, values, outstandings are stripped server-side,
  not hidden client-side (matches the approved design's role switcher behaviour).

## Auth (zero-cost, no third party)

- Email + password. PBKDF2-SHA-256, 100k iterations, 16-byte random salt (WebCrypto).
- Session token: 32 random bytes; only its SHA-256 hash stored in D1; HttpOnly, Secure,
  SameSite=Lax cookie; 30-day sliding expiry.
- Signup creates mill + owner atomically (D1 batch).

## Money & quantities

- Money stored as **integer paise**; quantities as **integer kg** (display in quintals = kg/100).
  No floats in the ledger.

## Mass balance (the moat)

`production_runs` records paddy consumed vs rice/bran/husk/broken produced per day.
`unexplained_pct = (in − Σout) / in`. Dashboard compares against `mills.loss_limit_pct`
(owner-set, default 3%) and raises the red alert exactly like the design. Nightly cron
precomputes the digest row per mill (cheap: one pass per mill per day).

## Plan gating & bill safety (V2-ready)

- `mills.plan`: `trial | starter | professional | enterprise`.
- Pay-per-use features (WhatsApp API digest, SMS) live behind a per-mill **monthly usage counter
  in D1 with a hard cap**; when the cap is hit the feature degrades to the free path
  (in-app digest + wa.me link). We never call a paid API without decrementing an allowance first.

## Scale-up path (V2, funded by revenue)

Workers Paid ($5/mo) → 30 s CPU + unlimited requests; D1 paid → 10 GB+; Durable Objects for live
gate queue; Queues for digest fan-out; R2 for documents. No re-architecture required — same code.
