// Where a URL opens (D-227, MOBILE; docs/specs/mobile.md D.2 `onShouldStartLoadWithRequest`). Pure, no React Native:
// React Native's URL class parses only http(s) hosts, so links are split with one regex here.

export interface Parts {
  scheme: string;
  host: string;
  path: string;
  /** `?…#…`, as written. */
  rest: string;
}

// A browser ends the host at `\` as at `/`, and the user info at the last `@`: `https://evil.com\@testnet.mitoshi.xyz`
// is evil.com, so it must never read as ours.
const URL_RE = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#\\]*))?([^?#]*)(.*)$/i;

export function parseUrl(url: string): Parts | null {
  const m = URL_RE.exec(url.trim());
  if (!m) return null;
  return { scheme: m[1]!.toLowerCase(), host: (m[2] ?? "").toLowerCase().replace(/^.*@/, ""), path: m[3] ?? "", rest: m[4] ?? "" };
}

/** Mitoshi's own hosts: the passkey rpId apex and every subdomain of it (testnet., stream., a docs host). */
export function isOurHost(host: string, rpId: string): boolean {
  const h = host.replace(/:\d+$/, "");
  return h === rpId || h.endsWith(`.${rpId}`);
}

/**
 * - `inside`: load in the web view (our pages, and the documents a page makes for itself: about:, data:, blob:);
 * - `browser`: another site — the system browser opens it and the web view stays put;
 * - `system`: any other scheme (mailto:, tel:, a wallet's wc: or app link) — the OS hands it to its app.
 */
export type Route = "inside" | "browser" | "system";

export function routeOf(url: string, rpId: string): Route {
  const p = parseUrl(url);
  if (!p) return "inside";
  if (p.scheme === "about" || p.scheme === "data" || p.scheme === "blob" || p.scheme === "javascript") return "inside";
  if (p.scheme === "https" || p.scheme === "http") return isOurHost(p.host, rpId) ? "inside" : "browser";
  return "system";
}

/**
 * The first page to open: a universal/App Link (`https://testnet.mitoshi.xyz/markets/…`) or `mitoshi://markets/…`
 * opens that path on `origin`; anything else opens the site's root.
 */
export function startUrl(link: string | null, origin: string, rpId: string, scheme: string): string {
  const p = link ? parseUrl(link) : null;
  if (!p) return origin;
  const ours = (p.scheme === "https" && isOurHost(p.host, rpId)) || p.scheme === scheme;
  if (!ours) return origin;
  // mitoshi://markets/BTC carries the first segment where a host would be.
  const path = p.scheme === scheme ? `/${p.host}${p.path}` : p.path;
  const clean = `/${path.replace(/^\/+/, "")}`;
  return `${origin.replace(/\/+$/, "")}${clean === "/" ? "" : clean}${p.rest}`;
}
