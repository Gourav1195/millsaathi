# MillSaathi security and crawler controls

## Repository controls

- `robots.txt` keeps public marketing and calculator pages discoverable, disallows `/api/`, and
  opts known training crawlers out without blocking Googlebot or Bingbot.
- `/app` and `/demo` carry `noindex` metadata.
- API responses are session-protected, tenant-scoped, and marked `Cache-Control: no-store`.
- Authentication attempts are bounded by a D1-backed per-IP/email window.
- Security response headers are applied by the Worker.

## Cloudflare account checklist

Configure these in the Cloudflare dashboard for the production zone rather than encoding account state in application code:

1. Enable managed bot protection and rate-limit `/api/auth/*`, `/api/feedback`, and large import endpoints.
2. Use Cloudflare's AI crawler controls to block training crawlers while allowing Googlebot and Bingbot.
3. Keep `/api/*` behind the Worker; never add API URLs to the sitemap.
4. Review firewall events after enabling controls so legitimate mill operators are not challenged.

AI crawler controls cannot guarantee that publicly visible pages will not be copied. Authenticated application data is protected by authentication and server-side tenant authorization.

## Turnstile

Login and signup support optional Cloudflare Turnstile verification. Configure the public site key
as `TURNSTILE_SITE_KEY` and store the secret with `wrangler secret put TURNSTILE_SECRET_KEY` in
production. The Worker verifies tokens server-side; when the secret is absent, local development
and seeded smoke tests continue without a challenge. Never commit either value.

## Import boundary

Party CSV and XLSX import are supported with a 2 MB / 1,000-row limit, bounded browser parsing, common-header mapping, preview validation, duplicate detection, and formula-safe exports. XLSX parsing is performed in the browser using platform ZIP/deflate APIs; the Worker receives only mapped row JSON and does not depend on the vulnerable `xlsx` package. Business documents export as CSV or Excel-compatible SpreadsheetML, both behind the export permission.

## Transaction reversals

Posted Sauda deliveries can be voided only by roles with `VOID` permission, require a reason, and remain in history for audit. Deliveries created from completed gate entries are immutable at the delivery layer; operators must correct the underlying gate record. Fulfilment totals exclude voided deliveries, while stock and gate records retain their own separate lifecycle controls.

## Role-based access control (V1)

Authorization is enforced in the Worker API using fixed role templates in `shared/permissions.ts`. Every authenticated route checks a specific `resource:action` capability; the Next.js UI mirrors the same definitions for navigation and button visibility only.

Finance data (rates, balances, payments, billing, document totals, exports) is returned only to `owner`, `admin`, and `accountant`. All other roles receive redacted payloads from the API.

| Capability | owner | admin | manager | accountant | gate_operator | production_operator | viewer | operator (legacy) |
|---|---|---|---|---|---|---|---|---|
| dashboard:view | yes | yes | yes | yes | yes | yes | yes | yes |
| gate:* | yes | yes | yes | — | yes | — | view | yes |
| parties/items/stock (operational) | yes | yes | yes | view | view | stock view | view | partial |
| processing runs | yes | yes | yes | — | — | yes | view | yes |
| processing configure | yes | yes | — | — | — | — | — | — |
| saudas/payments/documents/finance | yes | yes | — | yes | — | — | — | — |
| billing/team/organisation | yes | yes | — | — | — | — | — | — |
| settings manage / archives | yes | yes | — | — | — | — | — | — |
| digest:view | yes | yes | yes | yes | — | — | yes | — |

Unknown roles are denied by default. Legacy `operator` maps to combined gate and production floor access without finance or administration.
