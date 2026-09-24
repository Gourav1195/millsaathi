import Script from 'next/script';
import { THEME_STORAGE_KEY } from '../lib/theme';

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}}catch(e){}})();`;

/** Runs before hydration to avoid theme flash. Use next/script — raw script tags in React warn in React 19. */
export function ThemeScript() {
  return (
    <Script
      id="millsaathi-theme"
      strategy="beforeInteractive"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
