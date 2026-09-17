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

Party CSV and XLSX import are supported with a 2 MB / 1,000-row limit, preview validation, duplicate detection, and formula-safe exports. XLSX parsing is bounded and performed in the browser using platform ZIP/deflate APIs; the Worker receives only validated row JSON and does not depend on the vulnerable `xlsx` package. Business documents export as CSV or Excel-compatible SpreadsheetML, both behind the export permission.

## Transaction reversals

Posted Sauda deliveries can be voided only by roles with `VOID` permission, require a reason, and remain in history for audit. Deliveries created from completed gate entries are immutable at the delivery layer; operators must correct the underlying gate record. Fulfilment totals exclude voided deliveries, while stock and gate records retain their own separate lifecycle controls.
