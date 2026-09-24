import Script from 'next/script';

/* Mirrors public/index.html — hides Devanagari trust lines for visitors outside India. */
const REGION_SCRIPT = `(function(){try{var q=/[?&]region=(in|intl)\\b/i.exec(location.search);if(q){if(q[1].toLowerCase()==='intl')document.documentElement.setAttribute('data-region','intl');return;}var t=Intl.DateTimeFormat().resolvedOptions().timeZone||'',l=(navigator.languages||[navigator.language||'']).join(',');if(!/Asia\\/(Kolkata|Calcutta)/i.test(t)&&!/-IN\\b/i.test(l)&&!/\\b(hi|bn|mr|ta|te|gu|kn|ml|pa|or|as)\\b/i.test(l))document.documentElement.setAttribute('data-region','intl');}catch(e){}})();`;

/** Runs before hydration for region styling. Use next/script — raw script tags in React warn in React 19. */
export function RegionScript() {
  return (
    <Script
      id="millsaathi-region"
      strategy="beforeInteractive"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: REGION_SCRIPT }}
    />
  );
}
