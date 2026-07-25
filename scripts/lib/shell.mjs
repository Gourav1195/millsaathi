// Page shell for generated SEO pages. Every emitted page shares this <head>,
// nav, breadcrumb, CTA and footer so the free positioning and contact details
// live in exactly one place.

export const SITE = 'https://millsaathi.com';
export const WA = '918709575693';
export const PHONE_DISPLAY = '+91 87095 75693';
export const EMAIL = 'connect@equaseed.com';
export const GA_ID = 'G-WHW588NPD2';
export const OG_IMAGE = `${SITE}/assets/og-image.png`;

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LOGO_SVG = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 20V9l8-5 8 5v11" stroke="#E8B93B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 20v-5h6v5" stroke="#E8B93B" stroke-width="2" stroke-linecap="round"/><path d="M12 4v3" stroke="#C0451C" stroke-width="2" stroke-linecap="round"/></svg>`;

const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%23211F1A'/%3E%3Cpath d='M5 19V9.5L12 5l7 4.5V19' stroke='%23E8B93B' stroke-width='2' fill='none' stroke-linejoin='round'/%3E%3Cpath d='M9.5 19v-4h5v4' stroke='%23E8B93B' stroke-width='2' fill='none'/%3E%3C/svg%3E`;

function breadcrumbJsonLd(crumbs, path) {
  const items = [{ name: 'Home', url: `${SITE}/` }, ...crumbs].map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: c.url ?? `${SITE}${path}`,
  }));
  return { '@type': 'BreadcrumbList', itemListElement: items };
}

function faqJsonLd(faqs) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') },
    })),
  };
}

/**
 * @param {object} p
 * @param {string} p.path      absolute site path, e.g. "/calculators/rice-mill-outturn"
 * @param {string} p.title     <title> — PLAIN TEXT, no HTML entities (it is
 *                             escaped here, so "&amp;" would render as "&amp;").
 *                             Keep under ~60 chars.
 * @param {string} p.description meta description — plain text, same rule
 * @param {Array}  p.crumbs    [{name, url?}] — Home is prepended automatically
 * @param {string} p.body      main HTML
 * @param {Array}  [p.faqs]    [{q, a}] rendered as <details> + FAQPage schema
 * @param {object} [p.extraJsonLd] extra @graph node (e.g. WebApplication)
 * @param {string} [p.script]  inline JS appended before </body>
 * @param {object} [p.cta]     {title, body} overrides for the closing CTA
 */
export function page(p) {
  const url = `${SITE}${p.path}`;
  const graph = [breadcrumbJsonLd(p.crumbs, p.path)];
  if (p.faqs?.length) graph.push(faqJsonLd(p.faqs));
  if (p.extraJsonLd) graph.push(p.extraJsonLd);

  const faqHtml = p.faqs?.length
    ? `
  <section class="wrap-narrow">
    <h2>Common questions</h2>
    ${p.faqs
      .map(
        (f) => `<details>
      <summary>${esc(f.q)}<span class="plus">+</span></summary>
      <p>${f.a}</p>
    </details>`
      )
      .join('\n    ')}
  </section>`
    : '';

  const cta = p.cta ?? {
    title: 'See where your own quintals go.',
    body: `MillSaathi is free — every module, unlimited users, no card. Open the demo mill and click through a real day, or start your own mill in a few minutes.`,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="MillSaathi">
<meta property="og:locale" content="en_IN">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_ID}');
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/pages.css">
<link rel="icon" href="${FAVICON}">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)}
</script>
</head>
<body>

<header class="nav">
  <nav class="nav-in">
    <a class="brand" href="/">
      <span class="brand-mark">${LOGO_SVG}</span>
      <span class="brand-name">MillSaathi</span>
    </a>
    <div class="nav-links">
      <a class="nav-hide" href="/calculators">Calculators</a>
      <a class="nav-hide" href="/#modules">Modules</a>
      <a class="nav-hide" href="/#pricing">Pricing</a>
      <a href="/demo">Demo mill</a>
      <a class="nav-cta" href="/app">Start free</a>
    </div>
  </nav>
</header>

<div class="wrap-narrow">
  <div class="crumb">
    <a href="/">Home</a>${p.crumbs
      .map((c) => `<span>›</span>${c.url ? `<a href="${c.url.replace(SITE, '')}">${esc(c.name)}</a>` : esc(c.name)}`)
      .join('')}
  </div>
</div>

${p.body}
${faqHtml}

<section class="wrap-narrow">
  <div class="cta">
    <h2>${esc(cta.title)}</h2>
    <p>${cta.body}</p>
    <div class="btn-row">
      <a class="btn btn-acc" href="/app">Start free — no card
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#F6F1E6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
      <a class="btn btn-out" href="/demo">See the demo mill</a>
    </div>
  </div>
</section>

<footer class="foot">
  <div class="foot-in">
    <div style="flex:1 1 260px;max-width:320px;">
      <div class="brand" style="color:#F6F1E6;">
        <span class="brand-mark" style="background:#F6F1E6;">${LOGO_SVG.replace(/#E8B93B/g, '#211F1A').replace(/#C0451C/g, '#C0451C')}</span>
        <span class="brand-name">MillSaathi</span>
      </div>
      <p>Free operations &amp; ERP for India's mills. We tell you where every quintal actually went.</p>
      <p class="deva" style="color:#8A8272;">पता चलेगा माल कहाँ जा रहा है।</p>
    </div>
    <div>
      <h4>Talk to us</h4>
      <div class="col">
        <a href="https://wa.me/${WA}">WhatsApp</a>
        <a href="tel:+${WA}">${PHONE_DISPLAY}</a>
        <a href="mailto:${EMAIL}">${EMAIL}</a>
      </div>
    </div>
    <div>
      <h4>Free tools</h4>
      <div class="col">
        <a href="/calculators">All calculators</a>
        <a href="/calculators/rice-mill-outturn">Outturn &amp; loss</a>
        <a href="/calculators/paddy-moisture-deduction">Moisture deduction</a>
        <a href="/calculators/rice-cost-per-quintal">Cost per quintal</a>
      </div>
    </div>
    <div>
      <h4>Platform</h4>
      <div class="col">
        <a href="/#how">How it works</a>
        <a href="/#modules">Modules</a>
        <a href="/#pricing">Pricing (free)</a>
        <a href="/mill-software">Mill types</a>
        <a href="/mill-website">Website for your mill</a>
        <a href="/demo">Demo mill</a>
        <a href="/app">Log in</a>
      </div>
    </div>
  </div>
  <div class="foot-bar">
    <span>© 2026 MillSaathi · millsaathi.com</span>
    <span>Free for every mill.</span>
  </div>
</footer>
${p.script ? `<script>\n${p.script}\n</script>` : ''}
</body>
</html>
`;
}
