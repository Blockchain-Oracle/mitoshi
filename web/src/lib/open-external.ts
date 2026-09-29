/**
 * External links from the shell (ux-audit fix 5): inside the native app's web view a plain `<a target=_blank>` would
 * navigate the web view away, so the shell asks the host bridge to open the in-app browser; on the web it opens a new
 * tab with `noopener`. The bridge message is SM1's contract (`{ type: "open-external", url }`).
 */
interface ShellBridge {
  postMessage(message: string): void;
}

function bridge(): ShellBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ReactNativeWebView?: ShellBridge };
  return w.ReactNativeWebView ?? null;
}

export function openExternal(url: string): void {
  const host = bridge();
  if (host) {
    host.postMessage(JSON.stringify({ type: "open-external", url }));
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** onClick for an `<a href target=_blank>`: routes through the bridge in the app, lets the browser handle it otherwise. */
export function externalClick(event: { preventDefault(): void; currentTarget: { href: string } }): void {
  if (!bridge()) return;
  event.preventDefault();
  openExternal(event.currentTarget.href);
}
