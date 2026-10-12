// The script the app runs in every page it loads (D-227, MOBILE; docs/specs/mobile.md D.2/D.3, simplified: the web
// needs no change for any of it). It reports, over `window.ReactNativeWebView.postMessage`:
//   - `theme {mode}`: the web's `<html data-theme>` (set before first paint by lib/theme.ts, and on every toggle), so
//     the status bar and the native ground follow it;
//   - `ready {path}`: once, a frame after the first contentful paint (stylesheets are render-blocking, so it is the
//     styled first screen), so the native splash lifts onto it with no white frame and without waiting for a streamed
//     page to finish; DOMContentLoaded plus two frames where paint timing isn't offered;
//   - `save-file {name, mime, base64}`: a page's `<a download>` on a blob: or data: URL (the share card PNG, the data
//     export, the record CSV) — a web view can't save those itself, so the app writes the file and opens the share sheet.
// The web's own `open-external {url}` (lib/open-external.ts) arrives on the same channel. Installed once per document:
// iOS runs it at document start; Android's document-start hook is best effort (it may run before <html> exists, so the
// theme observer waits for the document element), so it runs again at load end and the guard keeps one copy.
export const SHELL_SCRIPT = `(function () {
  if (window.__cwfShell) return;
  window.__cwfShell = true;
  function post(message) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
  }
  var lastTheme = null;
  function theme() {
    var mode = document.documentElement && document.documentElement.getAttribute("data-theme");
    if ((mode === "dark" || mode === "light") && mode !== lastTheme) { lastTheme = mode; post({ type: "theme", mode: mode }); }
  }
  var watching = false;
  function watch() {
    if (watching || !document.documentElement) return;
    try {
      new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      watching = true;
    } catch (e) {}
  }
  watch();
  var told = false;
  function ready() {
    watch();
    theme();
    if (told) return;
    told = true;
    requestAnimationFrame(function () { post({ type: "ready", path: location.pathname }); });
  }
  try {
    new PerformanceObserver(function (list) {
      if (list.getEntriesByName("first-contentful-paint").length) ready();
    }).observe({ type: "paint", buffered: true });
  } catch (e) {}
  function loaded() {
    watch();
    theme();
    requestAnimationFrame(function () { requestAnimationFrame(ready); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loaded, { once: true });
  else loaded();
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var href = this.href || "";
    if (this.hasAttribute("download") && /^(blob|data):/.test(href)) {
      var name = this.getAttribute("download") || "mitoshi";
      fetch(href).then(function (r) { return r.blob(); }).then(function (blob) {
        var reader = new FileReader();
        reader.onload = function () {
          var url = String(reader.result);
          post({ type: "save-file", name: name, mime: blob.type || "application/octet-stream", base64: url.slice(url.indexOf(",") + 1) });
        };
        reader.readAsDataURL(blob);
      }).catch(function () {});
      return;
    }
    return click.apply(this, arguments);
  };
})();
true;`;
