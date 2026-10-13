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
