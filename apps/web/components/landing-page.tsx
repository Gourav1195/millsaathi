import Link from 'next/link';

const problemCards = [
  ['₹25+ lakh', 'Invisible losses', 'A 3% loss on 1,000 tonnes of paddy a season. It never appears in Tally as a line — it just isn\'t there.', 'accent'],
  ['40–60 days', 'Working capital locked', 'Cash tied up in stock and unreconciled lots you can\'t track godown-by-godown or lot-by-lot.', 'ink'],
  ['0.5–2%', 'Moisture gamed at the gate', 'Wet paddy weighed and paid for as dry. You\'re buying water, one truck at a time.', 'ink'],
  ['Every night', 'Disputes on memory', 'Bag-count and weight arguments settled over WhatsApp and a phone call — never against a record.', 'ink'],
];

const flowSteps = [
  ['Gate', 'Truck, driver, and lot logged on entry. Nothing enters unrecorded.'],
  ['Weighbridge', 'Gross and tare read straight off the indicator. No manual slip.'],
  ['Lab', 'Moisture and quality recorded against the lot — before you pay.'],
  ['Purchase', 'Rate applied on net dry weight. The sauda closes itself, correctly.'],
  ['Stock', 'Every lot in the right godown. Live quintals, not a monthly guess.'],
  ['Owner\'s phone', 'One WhatsApp digest each night. The real summary, not the munshi\'s.'],
];

const modules = [
  ['Gate & Weighbridge', 'Truck in, truck out — gross, tare and net captured direct from the bridge indicator.'],
  ['Lab & Quality', 'Moisture, broken %, grade — logged per lot and priced in, not argued about later.'],
  ['Purchase & Saudas', 'Broker deals, advances and rate agreements tracked to settlement, lot by lot.'],
  ['Inventory & Lots', 'Live godown-wise stock by lot and variety — traceable from purchase to dispatch.'],
  ['Production & Mass Balance', 'Paddy in vs. rice, bran and husk out — with the unexplained gap flagged automatically.', 'warn'],
  ['WhatsApp Owner Digest', 'The night summary the owner already asks for — automatic, accurate, on the phone he checks.', 'green'],
];

const millTypes: [string, string, boolean][] = [
  ['RICE', 'Set up rice mill', true],
  ['FLOUR', 'Set up flour mill', false],
  ['PULSES', 'Set up pulses / dal mill', false],
  ['SPICES', 'Set up spice mill', false],
  ['SUGAR', 'Set up sugar mill', false],
  ['OIL', 'Set up edible oil mill', false],
];

const pricingFeatures = [
  'Gate & Weighbridge',
  'Lab & Quality',
  'Purchase & Saudas',
  'Inventory & Lots',
  'Production & Mass Balance',
  'Suppliers & buyers khata',
  'WhatsApp Owner Digest',
  'Unlimited users & roles',
];

const faqs = [
  ['Does MillSaathi replace Tally?', 'No. MillSaathi captures what actually happens on the mill floor — weighbridge, lab, gate, production and sauda — and reconciles every lot. It then feeds clean, verified numbers into Tally instead of replacing your accounting.'],
  ['How do I track where every quintal of paddy goes in my mill?', 'Every lot is captured once at the source — gate entry, weighbridge, lab quality, production and dispatch — and MillSaathi runs a mass balance so you can see exactly where each quintal went and where it leaked.'],
  ['How do I stop stock leakage and weighbridge losses in a rice mill?', 'MillSaathi records every weighment and quality reading at the point it happens, so the gap between paddy in and rice out shows up immediately in the owner\'s nightly digest instead of hiding in the register.'],
  ['Can my staff use MillSaathi in Hindi on a phone?', 'Yes. It works on any phone or computer with nothing to install, and Hindi, Telugu and Tamil are coming to the mill floor so your operators, munshi and weighbridge staff can use it in their own language.'],
  ['How much does mill management software like MillSaathi cost?', 'Nothing. MillSaathi is free — every module, unlimited users, no card, no setup fee. We\'re not charging Indian mills while we learn the mill floor with them. If that ever changes you\'ll hear it from us first, and what you\'re using today stays free.'],
];

const floorFeatures = [
  ['Works on the phone you have', 'No install, no IT. Opens in the browser on any mid-range Android. Offline-first app coming next.'],
  ['In the language they speak', 'Hindi, Telugu and Tamil UI on the roadmap. The operator reads his own screen, not English he half-guesses.'],
  ['Slips the driver still wants', 'Weighment slip and lot receipt from the gate in seconds — Bluetooth thermal printing on the roadmap.'],
  ['Role-locked entry', 'Operator, manager, accountant and owner each see and change only what they should. A record no one can quietly rewrite.'],
];

export function LandingPage() {
  return (
    <main className="site-home">
      <header className="site-nav site-nav-sticky">
        <Link className="site-brand" href="/">
          <span className="site-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 20V9l8-5 8 5v11" />
              <path d="M9 20v-5h6v5" />
              <path d="M12 4v3" />
            </svg>
          </span>
          <span>MillSaathi</span>
        </Link>
        <nav>
          <a className="site-nav-secondary" href="#how">How it works</a>
          <a className="site-nav-secondary" href="#modules">Modules</a>
          <Link className="site-nav-secondary" href="/calculators">Calculators</Link>
          <a className="site-nav-secondary" href="#pricing">Pricing</a>
          <a className="site-nav-secondary" href="#faq">FAQ</a>
          <Link href="/app">Log in</Link>
          <Link className="site-cta" href="/app">Start free</Link>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="site-eyebrow"><i aria-hidden="true" />Free operations &amp; ERP for India&apos;s mills</p>
            <h1>
              Your mill runs on paper, WhatsApp, and trust in your munshi.
              <em> MillSaathi tells you where every quintal actually went.</em>
            </h1>
            <p className="deva">पता चलेगा माल कहाँ जा रहा है।</p>
            <p className="hero-summary">
              One system that captures reality at the source — weighbridge, lab, gate, production — and reconciles every lot.
              It doesn&apos;t replace Tally. It feeds it the truth.
            </p>
            <div className="hero-actions">
              <Link className="site-cta large" href="/app">Start free — no card <span aria-hidden="true">→</span></Link>
              <Link className="hero-secondary" href="/demo">See a demo mill</Link>
            </div>
            <p className="hero-note">Free for every mill · Built for rice mills first · Works on any device · Hindi, Telugu &amp; Tamil coming to the mill floor</p>
          </div>

          <div className="balance-card">
            <div className="balance-card-head">
              <div>
                <small>Today&apos;s mass balance</small>
                <h2>Sri Venkatesh Rice Mill</h2>
              </div>
              <b>● Live</b>
            </div>
            <div className="balance-numbers">
              <div><small>Paddy in</small><strong>1,000 <i>qtl</i></strong></div>
              <span aria-hidden="true">→</span>
              <div><small>Accounted out</small><strong>950 <i>qtl</i></strong></div>
            </div>
            <div className="balance-bar" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="balance-list">
              <p><span><i aria-hidden="true" />Rice</span><b>670 qtl · 67%</b></p>
              <p><span><i aria-hidden="true" />Bran</span><b>80 qtl · 8%</b></p>
              <p><span><i aria-hidden="true" />Husk</span><b>200 qtl · 20%</b></p>
            </div>
            <div className="loss-callout">
              <b>⚠ Unexplained <strong>50 qtl · 5.0%</strong></b>
              <span>≈ ₹1.15 lakh today at ₹2,300/qtl. Flagged for the owner before the shift closes.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="problem">
        <div className="landing-wrap">
          <div className="landing-intro">
            <p className="section-kicker">The problem</p>
            <h2>The leaks you can&apos;t see from the register.</h2>
            <p>On 2–6% margins, the loss isn&apos;t dramatic — it&apos;s quiet. A little every lot, every shift, until the season&apos;s profit is gone and no one can say where.</p>
          </div>
          <div className="problem-grid">
            {problemCards.map(([stat, title, copy, tone]) => (
              <article key={title}>
                <div className={`problem-stat ${tone}`}>{stat}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-alt" id="how">
        <div className="landing-wrap">
          <div className="landing-intro">
            <p className="section-kicker">How it works</p>
            <h2>Captured once, at the source. Never re-typed.</h2>
            <p>The weight recorded at the bridge is the weight in the purchase, the stock, and the balance sheet. No parallel registers. No end-of-day re-entry into Tally from memory.</p>
          </div>
          <div className="flow-grid">
            {flowSteps.map(([title, copy], index) => (
              <article key={title} className={index === 5 ? 'flow-step-highlight' : ''}>
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="modules">
        <div className="landing-wrap">
          <div className="landing-intro">
            <p className="section-kicker">Core modules</p>
            <h2>One platform. The whole mill, connected.</h2>
          </div>
          <div className="module-grid">
            {modules.map(([title, copy, tone]) => (
              <article key={title} className={tone ? `module-${tone}` : undefined}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-dark">
        <div className="landing-wrap landing-floor">
          <div>
            <p className="section-kicker section-kicker-gold">Built for the mill floor</p>
            <h2>Built for the mill floor, not the boardroom.</h2>
            <p className="landing-lede">The people entering data stand at a dusty gate on a mid-range Android with two bars of signal. MillSaathi is built for exactly that.</p>
            <div className="floor-list">
              {floorFeatures.map(([title, copy]) => (
                <div key={title}>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="phone-mock" aria-hidden="true">
            <div className="phone-shell">
              <div className="phone-screen">
                <div className="phone-header">
                  <small>9:14 PM · ● offline · will sync</small>
                  <strong>Night Digest · 12 Nov</strong>
                  <span>Sri Venkatesh Rice Mill</span>
                </div>
                <div className="phone-body">
                  <p><span>Paddy in today</span><b>42 trucks · 1,040 qtl</b></p>
                  <p><span>Rice dispatched</span><b>690 qtl</b></p>
                  <p><span>Cash paid</span><b>₹23.9 lakh</b></p>
                  <div className="phone-alert">
                    <b><span>⚠ Unexplained loss</span><strong>5.0%</strong></b>
                    <span>Above your 3% limit. Tap to see the 3 lots.</span>
                  </div>
                  <p className="deva phone-deva">पता चलेगा माल कहाँ जा रहा है।</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-alt landing-mill-types">
        <div className="landing-wrap landing-mill-types-inner">
          <div>
            <p className="section-kicker muted-kicker">Choose your mill</p>
            <h2>Start with the mill you run. We&apos;ll set up matching items and processing steps.</h2>
          </div>
          <div className="mill-type-links">
            {millTypes.map(([type, label, primary]) => (
              <Link key={type} className={primary ? 'mill-type-primary' : 'mill-type-secondary'} href={`/app?signup=1&mill_type=${type}`}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-wrap">
          <div className="mill-website-card">
            <div>
              <p className="section-kicker muted-kicker">A separate service</p>
              <h2>Want a website for your mill too?</h2>
              <p>Buyers and brokers look you up before they call. We build small, fast mill websites — your name, capacity, godowns, photos and a WhatsApp button, in Hindi or English.</p>
              <p className="mill-website-note">This one is separate from the software and is not free — the mill software stays ₹0 either way.</p>
            </div>
            <Link className="hero-secondary landing-dark-outline" href="/mill-website">See what we build →</Link>
          </div>
        </div>
      </section>

      <section className="landing-section" id="pricing">
        <div className="landing-wrap">
          <div className="landing-intro">
            <p className="section-kicker">Pricing</p>
            <h2>It&apos;s free. Poora ka poora.</h2>
            <p className="deva">पूरा सॉफ़्टवेयर, बिलकुल मुफ़्त। कोई छुपा हुआ चार्ज नहीं।</p>
            <p>Every module, every user, every truck. No card, no setup fee, no per-user creep, no &quot;demo pe baat karenge&quot; price.</p>
          </div>
          <div className="pricing-panel">
            <div>
              <p className="site-eyebrow"><i aria-hidden="true" />Free while we&apos;re building with you</p>
              <div className="pricing-amount"><strong>₹0</strong><span>/ month · per mill</span></div>
              <p className="pricing-copy">Unlimited users. Unlimited lots. All modules unlocked from day one — including the owner&apos;s night digest on WhatsApp.</p>
              <div className="hero-actions">
                <Link className="site-cta large" href="/app">Start free — no card <span aria-hidden="true">→</span></Link>
                <Link className="hero-secondary landing-on-dark" href="/demo">See the demo mill</Link>
              </div>
            </div>
            <div>
              <p className="pricing-list-kicker">Everything included</p>
              <ul className="pricing-list">
                {pricingFeatures.map((feature) => (
                  <li key={feature}><span>✓</span>{feature}</li>
                ))}
              </ul>
              <p className="pricing-footnote">Straight talk: MillSaathi is free today and we&apos;re not asking for card details. If we ever charge for something extra, existing mills will hear it from us first — and what you&apos;re using today stays free.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-alt" id="faq">
        <div className="landing-wrap landing-faq">
          <div className="landing-intro centered">
            <p className="section-kicker">Questions mill owners ask</p>
            <h2>Straight answers, before the demo.</h2>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}<span>+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-dark landing-cta" id="demo">
        <div className="landing-wrap centered">
          <h2>See it on your own numbers. Book a site visit.</h2>
          <p>We&apos;ll come to your mill, run one day&apos;s paddy through MillSaathi, and show you the balance. No slides, no jargon — just your grain, accounted for.</p>
          <div className="hero-actions centered-actions">
            <a className="site-cta large" href="https://wa.me/918709575693?text=Namaste%2C%20I%20want%20a%20MillSaathi%20demo%20for%20my%20mill.">WhatsApp us</a>
            <Link className="hero-secondary landing-on-dark" href="/demo">Explore the demo mill</Link>
          </div>
          <p className="hero-note">Mon–Sat · 9 AM–8 PM · Hindi, Telugu, Tamil &amp; English</p>
        </div>
      </section>

      <footer className="site-footer">
        <div className="landing-wrap site-footer-grid">
          <div>
            <div className="site-footer-brand">
              <span className="site-mark site-mark-light" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-5h6v5" /></svg>
              </span>
              <strong>MillSaathi</strong>
            </div>
            <p>Operations &amp; ERP for India&apos;s mills. We tell you where every quintal actually went.</p>
            <p className="deva">पता चलेगा माल कहाँ जा रहा है।</p>
          </div>
          <div>
            <p className="footer-kicker">Talk to us</p>
            <a href="https://wa.me/918709575693">WhatsApp</a>
            <a href="tel:+918709575693">+91 87095 75693</a>
            <a href="mailto:connect@equaseed.com">connect@equaseed.com</a>
          </div>
          <div>
            <p className="footer-kicker">Free tools</p>
            <Link href="/calculators">All calculators</Link>
            <Link href="/calculators/rice-mill-outturn">Outturn &amp; loss</Link>
            <Link href="/calculators/paddy-moisture-deduction">Moisture deduction</Link>
            <Link href="/calculators/rice-cost-per-quintal">Cost per quintal</Link>
          </div>
          <div>
            <p className="footer-kicker">Mills we serve</p>
            <Link href="/rice-mill-software">Rice mill software</Link>
            <Link href="/flour-mill-software">Flour mill software</Link>
            <Link href="/oil-mill-software">Oil mill software</Link>
            <Link href="/dal-mill-software">Dal mill software</Link>
            <Link href="/sugar-mill-software">Sugar mill software</Link>
            <Link href="/mill-website">Website for your mill</Link>
          </div>
          <div>
            <p className="footer-kicker">Platform</p>
            <a href="#problem">The problem</a>
            <a href="#how">How it works</a>
            <a href="#modules">Modules</a>
            <a href="#pricing">Pricing (free)</a>
            <a href="#faq">FAQ</a>
            <Link href="/demo">Demo mill</Link>
            <Link href="/app">Log in</Link>
          </div>
        </div>
        <div className="landing-wrap site-footer-meta">
          <span>© 2026 MillSaathi · millsaathi.com</span>
          <span>Made for the mill floor.</span>
        </div>
      </footer>
    </main>
  );
}
