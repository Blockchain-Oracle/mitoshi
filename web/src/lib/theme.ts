// Ported from Masayume 68f7a09:web/src/lib/theme.ts (storage key renamed)
// Theme: dark (default) + the cream light mode drawn from the brand films
// (#F4EEE3 paper / #141210 ink / #D93E1F vermilion / #2E6B4F matcha).
// Persisted per-browser; first visit with no stored choice follows the OS.
// Ported from reference/yosuku/lib/theme.ts @ 3c56ef5 — only the storage key is Masayume's.
const STORAGE_KEY = "cwf_theme";
/** Dismissed first-use explainers (`cwf.explained.<id>` = "1"): the head script marks them on <html> before first paint. */
export const EXPLAINED_PREFIX = "cwf.explained.";

export type Theme = "dark" | "light";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function osPrefersLight(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
}

/** Stored choice wins; else follow the OS; else dark. */
export function resolveTheme(): Theme {
  return getStoredTheme() ?? (osPrefersLight() ? "light" : "dark");
}

function apply(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeColor();
  }
}

/** `rgb(…)` passes; `color(srgb r g b)` (how a `color-mix` computes) becomes `#rrggbb`; anything else is null. */
function chromeColor(css: string): string | null {
  if (/^rgba?\(/.test(css)) return /,\s*0\)$|\/\s*0\)$/.test(css) ? null : css;
  const m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(css);
  if (!m) return null;
  return `#${m.slice(1, 4).map((v) => Math.round(Math.min(1, Number(v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The phone browser's bar takes the page's ground: the chosen theme, and the testnet canvas once the shell floods it
 * (critic bug 17, R4-8 D-227). `viewport.themeColor` keys it to the OS scheme only, so a toggled theme left the bar in
 * the other colour. Reads the computed ground, so it follows the tokens.
 */
export function syncThemeColor(): void {
  if (typeof document === "undefined" || !document.body) return;
  const color = chromeColor(getComputedStyle(document.body).backgroundColor);
  if (!color) return;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", color);
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — the attribute still applies for this page */
  }
  apply(theme);
}

export function toggleTheme(current: Theme): Theme {
  const next: Theme = current === "dark" ? "light" : "dark";
  setStoredTheme(next);
  return next;
}

/** Idempotent: set the attribute from the resolved theme, return it. */
export function initTheme(): Theme {
  const theme = resolveTheme();
  apply(theme);
  return theme;
}

// Blocking snippet injected before the app renders so the correct theme paints on the
// FIRST frame — no flash of dark. Kept tiny and dependency-free; mirrors resolveTheme().
export const THEME_INIT_SCRIPT = `(()=>{try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}try{var c=getComputedStyle(document.body).backgroundColor;if(/^rgb\\(/.test(c))document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',c)});}catch(e){}try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('${EXPLAINED_PREFIX}')===0&&localStorage.getItem(k)==='1')document.documentElement.classList.add('cwf-explained-'+k.slice(${EXPLAINED_PREFIX.length}));}}catch(e){}})();`;
