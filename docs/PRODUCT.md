# MillSaathi — Product Strategy (V1)

**Domain:** millsaathi.com · **Tagline:** "पता चलेगा माल कहाँ जा रहा है।" (You'll know where the goods are going.)

Operations & ERP SaaS for India's agro-processing mills. Start with **rice mills**; the core
(procurement → processing → by-products → sales) generalises to sugar, flour and oil mills later.

## 1. Market research (Jul 2026)

### Competitor landscape

| Competitor | Model | Price point | Weakness we exploit |
|---|---|---|---|
| AnnadataPro (Keshav Solutions, Odisha) | One-time purchase, Windows + mobile | one-time, "no monthly fees" positioning | Legacy desktop DNA; no mass-balance/loss analytics |
| Vira ERP (rice + cotton) | On-prem ERP | quote-based | Heavy, boardroom ERP; no offline mobile-first |
| Codeshilp weighbridge software | One-time | from ₹8,500 | Weighbridge only, not an operations loop |
| Digicube / Modernwebz / Vasudhaika etc. | One-time | ₹7k–₹20k | Point tools; data dies in one PC at the mill |
| Cropbiz (Punjab/Haryana) | SaaS | "affordable plans" | Regional; thin product |
| SAP B1 / MS Dynamics verticals | Enterprise ERP | ₹lakhs + consultants | Priced and shaped for large mills only |

**Key insight:** the market is legacy one-time-purchase Windows software sold as "no monthly fees".
Nobody owns the wedge we picked: **mass balance / unexplained-loss detection**, offline-first
Android at the gate, multilingual UI, and the owner's nightly WhatsApp digest. That's the moat —
the competitors record transactions; MillSaathi tells the owner **where every quintal actually went**
on 2–6% margins.

### Positioning (from the approved design)

- Hero promise: *"Your mill runs on paper, WhatsApp, and trust in your munshi. MillSaathi tells you
  where every quintal actually went."*
- **Doesn't replace Tally — feeds it the truth.** (Tally export is an Enterprise feature, not a fight.)
- Capture once at the source (gate → weighbridge → lab → purchase → stock → owner's phone), never re-typed.
- Sell against the loss: "Catch one gamed truck and it's paid for the month."

### Pricing — **free** (current, Jul 2026)

MillSaathi is **free for every mill**: all modules, unlimited users, no card. There is no payment
integration in this repo, so the site must not quote a price it cannot collect. The public pricing
section says ₹0; the paid tiers below are parked in an HTML comment in `public/index.html`.

Free is also the wedge. Competitors sell one-time at ₹8.5k–20k and every one of them makes the mill
owner sit through a demo before hearing a number. "Free, poora ka poora" removes the only objection
that matters at first contact, and distribution — not ARPU — is the constraint right now.

### Pricing (parked — restore only when billing exists)

- **Starter** ₹9,999/mo (annual): Gate & Weighbridge, Inventory & Lots, slip printing, 3 users.
- **Professional** ₹24,999/mo (annual): + Lab, Saudas, Mass Balance, WhatsApp digest, unlimited users.
- **Enterprise**: custom — multi-plant, Tally export, on-site training.

Any future monetisation must be justified by *found money* (the loss report), not by features, and
must honour the public promise that what a mill uses today stays free.

## 2. V1 scope (this repo, Cloudflare free tier)

1. **Marketing site** at `/` — pixel-faithful port of the approved landing design.
2. **Demo mill** at `/demo` — the full interactive dashboard with realistic seeded data, no login.
   This is the sales tool ("See a demo mill" CTA).
3. **Real app** at `/app` — multi-tenant, login, roles (owner / manager / accountant):
   gate & weighbridge workflow (token → gross → tare → lab → done), purchases & saudas,
   stock & lots by godown, suppliers, buyers, items, dashboard with **daily mass balance and
   unexplained-loss alert** vs the owner's set limit. Money fields hidden from Manager role.
4. **Digest V1 (free):** in-app night digest + one-tap `wa.me` share (zero cost).
   This is the free WhatsApp path — a `wa.me` deep link the owner taps, not a billed API call, so it
   costs us nothing and ships to everyone. WhatsApp Business API push (₹0.145/msg utility + GST) is
   the only genuinely metered thing on the roadmap; it stays V2 and behind a hard usage cap.

## 3. Out of scope for V1 (V2 roadmap)

- Offline-first Android app (Expo) + Bluetooth thermal printing
- Weighbridge indicator serial capture
- WhatsApp Business API automated digest, payments/UPI reconciliation
- Tally export, GST returns helpers
- Sugar / flour / oil mill templates (same core, different item graph & recovery ratios)
- Mandi price feed (Agmarknet API) on dashboard

## Sources

- https://keshavsolutions.com/rice-mill-software/
- https://www.punjabbulls.com/best-rice-mill-erp-software-india
- https://codeshilp.com/rice-mill-weighbridge-software/
- https://dir.indiamart.com/impcat/rice-mill-software.html
- https://cropbiz.in/best-rice-mill-management-software/
- https://www.viraerp.in/vira-erp-software-for-rice-mills-and-cotton-mill-10544410.html
- WhatsApp API India pricing: https://whautomate.com/whatsapp-business-api-pricing-india
