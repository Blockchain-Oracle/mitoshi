// The script the app runs in every page it loads (D-227, MOBILE; docs/specs/mobile.md D.2/D.3, simplified: the web
// needs no change for any of it). It reports, over `window.ReactNativeWebView.postMessage`:
//   - `theme {mode}`: the web's `<html data-theme>` (set before first paint by lib/theme.ts, and on every toggle), so
//     the status bar and the native ground follow it;
//   - `ready {path}`: two frames after DOMContentLoaded — the server-rendered page has painted with its styles, so the
//     native splash can lift onto it with no white frame;
//   - `save-file {name, mime, base64}`: a page's `<a download>` on a blob: or data: URL (the share card PNG, the data
//     export, the record CSV) — a web view can't save those itself, so the app writes the file and opens the share sheet.
// The web's own `open-external {url}` (lib/open-external.ts) arrives on the same channel. Installed once per document:
// iOS runs it at document start; Android's document-start hook is best effort, so it runs again at load end and the
// guard keeps one copy.
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
  try {
    new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch (e) {}
  function ready() {
    theme();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { post({ type: "ready", path: location.pathname }); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
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
      });
      return;
    }
    return click.apply(this, arguments);
  };
})();
true;`;
