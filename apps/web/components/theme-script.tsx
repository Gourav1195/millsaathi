import { THEME_STORAGE_KEY } from '../lib/theme';

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}}catch(e){}})();`;

export function ThemeScript() {
  return (
    <script
      id="millsaathi-theme"
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
