// Generates the SEO page set into public/ and rebuilds public/sitemap.xml.
//
//   npm run build:seo
//
// Everything under the OWNED paths below is written by this script — edit the
// content modules or scripts/lib/shell.mjs, never the generated HTML, or your
// change disappears on the next build. The landing page at public/index.html is
// hand-maintained and is NOT touched here (it is only listed in the sitemap).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { page, esc, SITE, WA } from './lib/shell.mjs';
import { calculators } from '../content/calculators.mjs';
import { states } from '../content/states.mjs';
import { millTypes } from '../content/mill-types.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const TODAY = new Date().toISOString().slice(0, 10);

/** Hand-maintained pages that belong in the sitemap but are not generated. */
const STATIC_URLS = [{ loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' }];

const written = [];

async function emit(path, html, { priority = '0.7', changefreq = 'monthly' } = {}) {
  const file = join(PUBLIC, path.replace(/^\//, ''), 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, 'utf8');
  written.push({ loc: `${SITE}${path}`, priority, changefreq });
}

function hero(eyebrow, h1, lede) {
  return `
  <section class="wrap-narrow hero">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${h1}</h1>
    <p class="lede">${lede}</p>
  </section>`;
}

function cardGrid(items) {
  return `<div class="grid">${items
    .map(
      (i) => `
    <a class="card" href="${i.href}">
      <h3>${i.title}</h3>
      <p>${i.blurb}</p>
      <span class="card-go">${i.go ?? 'Open'} →</span>
    </a>`
    )
    .join('')}
  </div>`;
}

/** Shared "what the product does" block, so every page says it the same way. */
const WHAT_IT_DOES = `
    <h2>What MillSaathi does</h2>
    <p>One system that captures reality at the source — gate, weighbridge, lab, production — and reconciles every lot against it. It does not replace Tally. It feeds Tally numbers that are actually true.</p>
    <ul>
      <li><strong>Gate &amp; Weighbridge</strong> — truck, driver and lot logged on entry; gross, tare and net captured once and never re-typed</li>
      <li><strong>Lab &amp; Quality</strong> — moisture and grade recorded against the lot before you pay for it</li>
      <li><strong>Purchase &amp; Saudas</strong> — broker deals, advances and rate agreements tracked through to settlement</li>
      <li><strong>Inventory &amp; Lots</strong> — live stock by lot, variety and godown, not a monthly guess</li>
      <li><strong>Suppliers &amp; buyers khata</strong> — the running balance everybody argues about, written down</li>
      <li><strong>Role-locked entry</strong> — operator, manager, accountant and owner each see and change only what they should</li>
      <li><strong>Night digest</strong> — the summary you call your manager for, shareable on WhatsApp in one tap</li>
    </ul>`;

const FREE_BLOCK = `
    <h2>The price is zero</h2>
    <p class="deva" style="font-size:19px;color:var(--ink);">पूरा सॉफ़्टवेयर, बिलकुल मुफ़्त। कोई छुपा हुआ चार्ज नहीं।</p>
    <p>Every module, unlimited users, unlimited lots, no card and no setup fee. There is no trial that expires and no demo call you have to sit through before anyone will tell you a number. We would rather learn the mill floor with a hundred mills than bill ten — and if that ever changes, existing mills will hear it from us first and what you are using today stays free.</p>`;

const SHARED_FAQS = [
  {
    q: 'Is MillSaathi really free?',
    a: 'Yes. All modules, unlimited users, no card, no setup fee, no expiring trial. There is no payment collection in the product at all today. If we ever charge for something extra, existing mills will be told first and what you are using now stays free.',
  },
  {
    q: 'Does it replace Tally?',
    a: 'No. MillSaathi captures what physically happens on the mill floor and reconciles every lot; Tally stays your accounting. The point is to feed Tally verified numbers instead of end-of-day re-entry from memory.',
  },
  {
    q: 'What do my staff need to use it?',
    a: 'A browser on the phone they already have. Nothing to install, no IT, no licence — it runs on a mid-range Android at a dusty gate, which is the actual requirement. An offline-first app and Bluetooth slip printing are on the roadmap.',
  },
];

/* ------------------------------------------------------------------ */
/* calculators                                                         */
/* ------------------------------------------------------------------ */

async function buildCalculators() {
  for (const c of calculators) {
    const path = `/calculators/${c.slug}`;
    await emit(
      path,
      page({
        path,
        title: c.title,
        description: c.description,
        crumbs: [{ name: 'Calculators', url: `${SITE}/calculators` }, { name: c.navTitle }],
        body: hero('Free calculator · no signup', c.h1, c.lede) + c.body,
        script: c.script,
        faqs: [...c.faqs, SHARED_FAQS[1]],
        extraJsonLd: {
          '@type': 'WebApplication',
          name: c.title.split('—')[0].trim(),
          url: `${SITE}${path}`,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          browserRequirements: 'Requires JavaScript',
          offers: { '@type': 'Offer', priceCurrency: 'INR', price: '0' },
        },
      }),
      { priority: '0.9' }
    );
  }

  const path = '/calculators';
  await emit(
    path,
    page({
      path,
      title: 'Free Rice Mill Calculators — Outturn, Moisture, Cost',
      description:
        'Free calculators for Indian rice mills: outturn and unexplained loss, paddy moisture deduction, and true cost per quintal of rice. No signup, nothing stored.',
      crumbs: [{ name: 'Calculators' }],
      body:
        hero(
          'Free tools',
          'Rice mill calculators',
          'Three sums every mill does on the back of a slip, done properly. No signup, no email, nothing leaves your browser — and the arithmetic is shown so you can check it.'
        ) +
        `
  <section class="wrap-narrow prose">
    ${cardGrid(
      calculators.map((c) => ({
        href: `/calculators/${c.slug}`,
        title: c.navTitle,
        blurb: c.cardBlurb,
        go: 'Open calculator',
      }))
    )}

    <h2>Why we give these away</h2>
    <p>Each one of these is a small piece of what MillSaathi does automatically. The outturn calculator is the mass balance for a single day, typed in by hand. The moisture calculator is what the Lab module does to a lot before the purchase gets priced. The cost calculator is the sum an owner does in his head before agreeing a rate on the phone.</p>
    <p>Doing them once tells you today's number. The reason mills keep leaking is not that the arithmetic is hard — it is that nobody does it for every lot, every day, against a record. That part is what the product is for, and the product is free too.</p>
  </section>`,
      faqs: SHARED_FAQS,
    }),
    { priority: '0.9' }
  );
}

/* ------------------------------------------------------------------ */
/* states                                                              */
/* ------------------------------------------------------------------ */

async function buildStates() {
  for (const s of states) {
    const path = `/rice-mill-software/${s.slug}`;
    await emit(
      path,
      page({
        path,
        title: `Free Rice Mill Software in ${s.name} — MillSaathi`,
        description: `Free rice mill management software for mills in ${s.name}. Gate and weighbridge capture, lab quality, saudas, live stock and the owner's nightly mass balance. All modules free, unlimited users, no card.`,
        crumbs: [
          { name: 'Rice mill software', url: `${SITE}/rice-mill-software` },
          { name: s.name },
        ],
        body:
          hero(
            `For mills in ${s.name}`,
            `Free rice mill software in ${esc(s.name)}`,
            `Built for mills around ${esc(s.hubs)} — and for the fact that the person entering data is standing at a gate on a mid-range Android, not sitting at a desk. Free, with every module included.`
          ) +
          `
  <section class="wrap-narrow prose">
    <h2>What milling in ${esc(s.name)} actually looks like</h2>
    <p>${esc(s.reality)}</p>

    <h2>Where ${esc(s.name)} mills leak</h2>
    <ul class="leak">
      ${s.pains.map((x) => `<li>${esc(x)}</li>`).join('\n      ')}
    </ul>
    <div class="callout">
      <p>None of this shows up in Tally as a line, because there is no transaction to record — it is an absence. On the two to six percent margins a mill actually runs, that absence is the profit.</p>
    </div>
${WHAT_IT_DOES}

    <h2>In the language your mill floor speaks</h2>
    <p>The people entering data in ${esc(s.name)} mostly work in ${esc(s.langs)}. ${esc(s.langs.split(' and ')[0])} on the mill floor is on the roadmap alongside Hindi, Telugu and Tamil. Today the interface is English, but the workflow is built around weights, lot numbers and quantities rather than dense text — and it opens in a browser on the phone your operator already owns, with nothing to install.</p>
${FREE_BLOCK}
  </section>`,
        faqs: [...s.faqs, ...SHARED_FAQS],
      }),
      { priority: '0.7' }
    );
  }

  const path = '/rice-mill-software';
  await emit(
    path,
    page({
      path,
      title: 'Free Rice Mill Software in India — MillSaathi',
      description:
        "Free rice mill management software for Indian mills: gate, weighbridge, lab, saudas, stock and the owner's nightly mass balance. Every module free, unlimited users, no card.",
      crumbs: [{ name: 'Rice mill software' }],
      body:
        hero(
          'Rice mills · live today',
          'Free rice mill software for Indian mills',
          'Gate, weighbridge, lab, saudas, stock and a mass balance that flags the unexplained gap before the shift closes. Every module free, unlimited users, no card — this is the vertical MillSaathi is built for.'
        ) +
        `
  <section class="wrap-narrow prose">
${WHAT_IT_DOES}

    <h2>By state</h2>
    <p>Milling is not the same business in every state — custom milling against a fixed ratio is a different problem from a basmati export line, and a mill buying from hundreds of small farmers has a different leak from one lifting large procurement consignments.</p>
    ${cardGrid(
      states.map((s) => ({
        href: `/rice-mill-software/${s.slug}`,
        title: s.name,
        blurb: `${s.hubs.charAt(0).toUpperCase()}${s.hubs.slice(1)} — ${s.langs}.`,
        go: 'Read',
      }))
    )}

    <h2>Free tools you can use right now</h2>
    <p>No signup on any of these.</p>
    ${cardGrid(
      calculators.map((c) => ({
        href: `/calculators/${c.slug}`,
        title: c.navTitle,
        blurb: c.cardBlurb,
        go: 'Open calculator',
      }))
    )}
${FREE_BLOCK}
  </section>`,
      faqs: SHARED_FAQS,
    }),
    { priority: '0.9' }
  );
}

/* ------------------------------------------------------------------ */
/* mill types                                                          */
/* ------------------------------------------------------------------ */

/** Honest status block — see the constraint comment in content/mill-types.mjs. */
function statusBlock(m) {
  return `
    <h2>Straight answer on what works today</h2>
    <p>MillSaathi is built and live for rice mills. We are not going to pretend a ${m.name.toLowerCase()} build exists when it does not, so here is exactly where things stand.</p>
    <div class="callout">
      <p><strong>Works for your mill today, unchanged:</strong> gate and weighbridge capture, live stock by lot and godown, suppliers and buyers khata, purchase and saudas, payments, role-locked entry, and the owner's night digest. None of that is rice-specific — it is grain in, grain stored, grain out.</p>
      <p><strong>Not yet:</strong> the production mass balance is currently shaped for paddy in versus rice, bran and husk out. For ${esc(m.input)} in versus ${esc(m.outputs)} out, that needs your product names added — which is a configuration change on our side, not a rebuild.</p>
    </div>
    <p>So if you run a ${m.name.toLowerCase()}, you can start using the majority of the product this week for nothing, and the balance follows. <a href="https://wa.me/${WA}?text=${encodeURIComponent(
      `Namaste, I run a ${m.name.toLowerCase()} and want to use MillSaathi.`
    )}">Tell us on WhatsApp what your mill runs</a> and we will set the products up for you. It is free either way — there is nothing to buy and nothing to upgrade to.</p>`;
}

async function buildMillTypes() {
  for (const m of millTypes) {
    const path = `/${m.slug}`;
    await emit(
      path,
      page({
        path,
        title: m.title,
        description: m.description,
        crumbs: [{ name: 'Mill software', url: `${SITE}/mill-software` }, { name: m.name }],
        body:
          hero(
            'Free · one core, many mills',
            m.h1,
            `Procurement, processing, by-products and sales is the same shape in every mill. Here is what that means for a ${m.name.toLowerCase()} — and an honest account of what is built and what is not.`
          ) +
          `
  <section class="wrap-narrow prose">
    <h2>A ${esc(m.name.toLowerCase())} has the same shape as a rice mill</h2>
    <p>${esc(m.reality)}</p>

    <h2>Where the money goes missing</h2>
    <p>${esc(m.leak)}</p>
    <div class="callout">
      <p>The common thread across every kind of mill: the loss is quiet, it never appears in the accounts as a line, and by the time it is visible in the annual numbers nobody can say which lot it came from.</p>
    </div>
${statusBlock(m)}
${WHAT_IT_DOES}
${FREE_BLOCK}
  </section>`,
        faqs: [
          {
            q: `Can I use MillSaathi for a ${m.name.toLowerCase()} today?`,
            a: `Mostly, yes. Gate and weighbridge capture, stock by lot and godown, supplier and buyer khata, saudas, payments and the night digest all work for any mill. The production mass balance is currently rice-shaped, so ${esc(m.input)} into ${esc(m.outputs)} needs your products configured — message us and we will do it. It is free either way.`,
          },
          {
            q: `How much does ${m.name.toLowerCase()} software cost?`,
            a: 'MillSaathi is free — every module, unlimited users, no card, no setup fee. Most mill software in India sells as a one-time Windows licence and makes you sit through a demo before anyone quotes a number. We would rather you just used it.',
          },
          ...SHARED_FAQS,
        ],
      }),
      { priority: '0.7' }
    );
  }

  const path = '/mill-software';
  await emit(
    path,
    page({
      path,
      title: 'Free Mill Software in India — Rice, Flour, Oil, Dal',
      description:
        'Free mill management software for Indian mills. Rice is live today; flour, oil, dal and sugar mills can use the gate, weighbridge, stock and khata modules now. No cost, no card.',
      crumbs: [{ name: 'Mill software' }],
      body:
        hero(
          'One core, many mills',
          'Free mill software for India',
          'Grain in, grain stored, grain processed, grain out — the shape is the same whether you mill paddy, wheat, oilseed, pulses or cane. Rice is fully built and live. The rest can use most of the product today.'
        ) +
        `
  <section class="wrap-narrow prose">
    ${cardGrid([
      {
        href: '/rice-mill-software',
        title: 'Rice mill — live',
        blurb:
          'Fully built: gate, weighbridge, lab, saudas, stock and the nightly mass balance with unexplained-loss alerts.',
        go: 'Rice mill software',
      },
      ...millTypes.map((m) => ({
        href: `/${m.slug}`,
        title: m.name,
        blurb: `${m.input.charAt(0).toUpperCase()}${m.input.slice(1)} in, ${m.outputs} out. Everything but the mass balance works today.`,
        go: 'Read the honest status',
      })),
    ])}

    <h2>Why one core covers all of them</h2>
    <p>Every mill in the country runs the same four steps: procure, process, sell the main product, sell the by-products. The details differ — a sugar mill weighs cane from hundreds of growers, a dal mill runs several passes, an oil mill lives on recovery percentage — but the thing that leaks is identical. Weight changes at points nobody records, and by-products leave without being tied to the lot that produced them.</p>
    <p>That is why the gate, the weighbridge, the stock ledger and the khata are not rice-specific at all. Only the production balance needs to know what your mill actually makes.</p>
${FREE_BLOCK}
  </section>`,
      faqs: SHARED_FAQS,
    }),
    { priority: '0.8' }
  );
}

/* ------------------------------------------------------------------ */
/* mill website service                                                */
/* ------------------------------------------------------------------ */

// A separate paid-or-negotiated service, NOT part of the free software. Two
// rules for this page: (1) never quote a price — there is still no way to
// collect one; (2) never blur it into the "poora ka poora free" promise, or the
// free positioning reads as bait. Keep the separation explicit.
async function buildMillWebsite() {
  const path = '/mill-website';
  await emit(
    path,
    page({
      path,
      title: 'Rice Mill Website Design — MillSaathi',
      description:
        "We build simple, fast websites for Indian mills — your mill's name, what you mill, capacity, godowns and a WhatsApp button, in Hindi or English. Separate from the free MillSaathi software.",
      crumbs: [{ name: 'Mill website' }],
      body:
        hero(
          'A separate service',
          'A simple website for your mill',
          'Buyers, brokers and procurement officers look you up before they call. If nothing comes up, or a Justdial listing from 2015 does, that is the impression you are making. We build small, fast mill websites — and we build them the same way we built this one.'
        ) +
        `
  <section class="wrap-narrow prose">
    <div class="callout">
      <p><strong>First, the important bit:</strong> the MillSaathi software is free and always will be — gate, weighbridge, lab, saudas, stock, mass balance, unlimited users, no card. This page is about something else entirely: a website for your own mill. It is a separate service and it is not required to use the software. Nothing here changes what you get for free.</p>
    </div>

    <h2>Why a mill needs one at all</h2>
    <p>Milling is still a trade run on relationships, and that is not changing. But the first check has quietly moved online. A buyer in another state, a broker you have not dealt with before, an exporter deciding whom to shortlist — they search your mill's name before they pick up the phone, and what they find decides whether they bother.</p>
    <ul>
      <li>Buyers and brokers verify you exist, at the scale you claim, before the first call</li>
      <li>Procurement and tender paperwork increasingly expects a web presence against your GST and registration details</li>
      <li>The next generation running family mills checks online first — including your own buyers' sons</li>
      <li>A page you control beats a stale directory listing you have no way to correct</li>
    </ul>

    <h2>What you get</h2>
    <p>Deliberately small. A mill does not need a ten-page website with a blog — it needs one page that loads instantly on a phone with two bars of signal and answers what a buyer actually asks.</p>
    <ul>
      <li>Your mill's name, location, and how long you have been running</li>
      <li>What you mill, which varieties, and your capacity — the questions every buyer opens with</li>
      <li>Godowns and storage, weighbridge, and your certifications or registrations</li>
      <li>Photos of the actual mill, not stock images of somebody else's plant</li>
      <li>A WhatsApp button and a phone number that work on one tap</li>
      <li>Hindi or English, or both — your buyer's language, not ours</li>
      <li>Your own domain, and a site fast enough to open on a rural connection</li>
    </ul>

    <h2>How it works</h2>
    <p>Message us on WhatsApp with your mill's name and what you mill. We will tell you plainly what we would build, what it involves, and what it costs — before you commit to anything. If it is not worth it for your mill, we will say so; a website is not going to fix a business that does not need one.</p>
    <div class="btn-row" style="justify-content:flex-start;margin-top:22px;">
      <a class="btn btn-acc" href="https://wa.me/${WA}?text=${encodeURIComponent(
        'Namaste, I want a website for my mill. My mill is:'
      )}">Ask about a mill website
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#F6F1E6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </div>

    <h2>Why trust us with it</h2>
    <p>You are on the thing we would build. This site, the demo mill, the free calculators and the whole MillSaathi application are ours — built for Indian mills, on Indian connections, for people working on mid-range Android phones at a dusty gate. We are not a web agency that happened to take a mill enquiry. We already know what a sauda is, why moisture matters at the gate, and what your buyer is going to ask you.</p>
  </section>`,
      faqs: [
        {
          q: 'Is the mill website free like the software?',
          a: 'No, and we would rather be straight about that than surprise you later. The MillSaathi software is genuinely free with no card and no limits. A website for your own mill is a separate service with real work behind it — message us and we will tell you what it involves and what it costs before you commit to anything.',
        },
        {
          q: 'Do I have to use MillSaathi to get a website?',
          a: 'No. They are independent. You can use the free software and never ask about a website, or ask about a website without using the software at all.',
        },
        {
          q: 'Can the website be in Hindi?',
          a: 'Yes — Hindi, English, or both. Your buyers and brokers should read it in whatever language they actually use, which for most mills is not English.',
        },
        {
          q: 'How long does it take?',
          a: "It depends on how quickly you can send photos and your mill's details, which is usually the slow part rather than the building. Message us and we will give you a realistic timeline for your mill rather than a number off a price list.",
        },
        ...SHARED_FAQS,
      ],
      cta: {
        title: 'The software stays free either way.',
        body: 'A website is optional and separate. The mill software — gate, weighbridge, lab, saudas, stock and the nightly mass balance — costs nothing, needs no card, and has no user limit.',
      },
    }),
    { priority: '0.6' }
  );
}

/* ------------------------------------------------------------------ */
/* sitemap                                                             */
/* ------------------------------------------------------------------ */

async function buildSitemap() {
  const urls = [...STATIC_URLS, ...written].sort((a, b) => a.loc.localeCompare(b.loc));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/build-seo.mjs — do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
  await writeFile(join(PUBLIC, 'sitemap.xml'), xml, 'utf8');
  return urls.length;
}

/* ------------------------------------------------------------------ */

await buildCalculators();
await buildStates();
await buildMillTypes();
await buildMillWebsite();
const count = await buildSitemap();

console.log(`Generated ${written.length} pages, sitemap with ${count} URLs.`);
for (const w of written) console.log(`  ${w.loc.replace(SITE, '')}`);
