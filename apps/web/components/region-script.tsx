/* Mirrors public/index.html — hides Devanagari trust lines for visitors outside India. */
const REGION_SCRIPT = `(function(){try{var q=/[?&]region=(in|intl)\\b/i.exec(location.search);if(q){if(q[1].toLowerCase()==='intl')document.documentElement.setAttribute('data-region','intl');return;}var t=Intl.DateTimeFormat().resolvedOptions().timeZone||'',l=(navigator.languages||[navigator.language||'']).join(',');if(!/Asia\\/(Kolkata|Calcutta)/i.test(t)&&!/-IN\\b/i.test(l)&&!/\\b(hi|bn|mr|ta|te|gu|kn|ml|pa|or|as)\\b/i.test(l))document.documentElement.setAttribute('data-region','intl');}catch(e){}})();`;

export function RegionScript() {
  return (
    <script
      id="millsaathi-region"
      dangerouslySetInnerHTML={{ __html: REGION_SCRIPT }}
    />
  );
}
