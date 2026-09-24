import Link from 'next/link';

type NotFoundContext = 'site' | 'app';

const copy: Record<
  NotFoundContext,
  { headline: string; summary: string; hindi: string; primary: { href: string; label: string }; secondary: { href: string; label: string } }
> = {
  site: {
    headline: 'This page isn\u2019t in the register.',
    summary:
      'The address you opened doesn\u2019t match any route we know \u2014 like a lot that never got a gate entry. Head home or open your mill dashboard.',
    hindi: '\u092f\u0939 \u092a\u0947\u091c \u0930\u091c\u093f\u0938\u094d\u091f\u0930 \u092e\u0947\u0902 \u0928\u0939\u0940\u0902 \u092e\u093f\u0932\u093e\u0964',
    primary: { href: '/', label: 'Back to home' },
    secondary: { href: '/app', label: 'Open your mill' },
  },
  app: {
    headline: 'No module on this floor.',
    summary:
      'That screen doesn\u2019t exist in your mill yet. Use the sidebar, or return to the dashboard and pick a module that is.',
    hindi: '\u092f\u0939 \u092e\u0949\u0921\u094d\u092f\u0942\u0932 \u0905\u092d\u0940 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964',
    primary: { href: '/app', label: 'Go to dashboard' },
    secondary: { href: '/', label: 'Marketing site' },
  },
};

function BrandMark() {
  return (
    <span className="site-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M9 20v-5h6v5" />
        <path d="M12 4v3" />
      </svg>
    </span>
  );
}

export function NotFoundPage({ context = 'site' }: { context?: NotFoundContext }) {
  const text = copy[context];
  const pageClass = context === 'site' ? 'site-home not-found-page' : 'not-found-page';

  return (
    <main className={pageClass}>
      <header className="site-nav">
        <Link className="site-brand" href="/">
          <BrandMark />
          <span>MillSaathi</span>
        </Link>
        <nav>
          <Link className="site-nav-secondary" href="/calculators">Calculators</Link>
          <Link href="/app">Log in</Link>
          <Link className="site-cta" href="/app">Start free</Link>
        </nav>
      </header>

      <section className="hero not-found-hero" aria-labelledby="not-found-title">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="site-eyebrow"><i aria-hidden="true" />Error 404</p>
            <p className="not-found-code" aria-hidden="true">404</p>
            <h1 id="not-found-title">{text.headline}</h1>
            <p className="deva">{text.hindi}</p>
            <p className="hero-summary">{text.summary}</p>
            <div className="hero-actions">
              <Link className="site-cta large" href={text.primary.href}>
                {text.primary.label} <span aria-hidden="true">&rarr;</span>
              </Link>
              <Link className="hero-secondary" href={text.secondary.href}>{text.secondary.label}</Link>
            </div>
          </div>

          <aside className="balance-card not-found-card" aria-label="Missing page record">
            <div className="balance-card-head">
              <div>
                <small>System lookup</small>
                <h2>Page not found</h2>
              </div>
              <b className="not-found-badge">Missing</b>
            </div>

            <dl className="not-found-meta">
              <div>
                <dt>Record type</dt>
                <dd>Route / URL</dd>
              </div>
              <div>
                <dt>Gate entry</dt>
                <dd>Never logged</dd>
              </div>
              <div>
                <dt>Mass balance</dt>
                <dd className="not-found-gap">Unexplained</dd>
              </div>
            </dl>

            <div className="balance-bar not-found-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>

            <div className="loss-callout">
              <b>
                <span>Gap flagged</span>
                <strong>100%</strong>
              </b>
              <span>Every quintal should be traceable. This page isn&apos;t.</span>
            </div>
          </aside>
        </div>
      </section>

      <footer className="not-found-foot">
        <span>Need help finding something?</span>
        <Link href="https://wa.me/918709575693">WhatsApp us</Link>
        <span aria-hidden="true">&middot;</span>
        <Link href="/calculators">Free calculators</Link>
      </footer>
    </main>
  );
}
