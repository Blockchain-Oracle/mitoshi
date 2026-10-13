// The phone app's web view (D-230 round 7, the owner's TestFlight review): the native shell appends `CWFShell/<ver>` to
// the user agent (mobile/src/shell/config.ts), and the page marks `<html data-shell="app">` before it paints so the
// app never shows web-only chrome (the landing, the web splash, link previews). Read on the client, never on the
// server: a header read in the root layout would make every page dynamic. The proxy reads the same mark to send the
// app's `/` to Markets (proxy.ts).
export const SHELL_UA = /CWFShell\//;

/** Inline, before first paint (app/layout.tsx). */
export const SHELL_INIT_SCRIPT = `try{if(${SHELL_UA}.test(navigator.userAgent)||window.ReactNativeWebView)document.documentElement.setAttribute('data-shell','app')}catch(e){}`;

/** Whether this page runs inside the phone app (client only; false during server render). */
export function inAppShell(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.shell === "app";
}

/** Set by the welcome when a first-time app user leaves it (features/welcome/WelcomeScreen.tsx). */
export const WELCOMED_COOKIE = "cwf_welcomed";
/** wagmi's stored connection names a current account once someone has signed in on this device (lib/theme.ts). */
const SIGNED_IN = /"current":"/;

/**
 * Where the app's home lands (proxy.ts): a first-time app user who has never signed in meets the welcome; everyone
 * else Markets. Null for a request this doesn't decide.
 */
export function appHome(pathname: string, cookie: (name: string) => string | undefined): string | null {
  if (pathname !== "/" && pathname !== "/markets") return null;
  const fresh = cookie(WELCOMED_COOKIE) !== "1" && !SIGNED_IN.test(decodeURIComponent(cookie("wagmi.store") ?? ""));
  if (fresh) return "/welcome";
  return pathname === "/" ? "/markets" : null;
}
