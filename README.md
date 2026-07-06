# MillSaathi

Operations & ERP SaaS for India's mills (rice first; sugar/flour/oil later). Live at
**https://millsaathi.com** — running 100% on the Cloudflare free tier.

| Surface | URL | What it is |
|---|---|---|
| Marketing site | `/` | Landing page (Claude Design handoff, pixel-faithful) |
| Demo mill | `/demo` | Full interactive dashboard, client-side data, no login — the sales tool |
| Real app | `/app` | Multi-tenant ERP: signup/login, gate & weighbridge, saudas, stock & lots, suppliers/buyers/items, mass balance, night digest |
| API | `/api/*` | Hono JSON API on Workers + D1 |

## Demo logins (seeded mill "Sri Venkatesh Rice Mill", password `demo1234`)

- `owner@demo.millsaathi.com` — sees everything
- `manager@demo.millsaathi.com` — money fields stripped server-side
- `accounts@demo.millsaathi.com` — payables/receivables view

## Stack

One Worker (`wrangler.jsonc`): static assets from `public/`, API in `src/` (Hono + D1).
No other services, no secrets. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for free-tier
math and [docs/PRODUCT.md](docs/PRODUCT.md) for market research, positioning and roadmap.

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

## Conventions

- Weights: integer **kg** in DB/API; UI shows quintals (kg/100).
- Money: integer **paise**; any API field containing `paise` is auto-stripped for the Manager role.
- The mill business day is **IST** (`istToday()` in `src/api.ts`), regardless of where the Worker runs.

## Before launch (TODO)

- Replace placeholder WhatsApp number `+91 98765 43210` in `public/index.html`.
- Add Turnstile to login/signup.
- Rate-limit auth endpoints.
- Set up `hello@millsaathi.com` (Cloudflare Email Routing, free).
