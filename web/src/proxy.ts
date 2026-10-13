// Ported from Agari 03b30ab:web/src/proxy.ts — the geofence per pillar (plan C.3.5, Q-008 default) plus the /dev gate
// (C.3.6). Next 16's `proxy` (Node runtime, D-055). A restricted country — from a CDN's country header in front of
// Coolify (`cf-ipcountry`), Vercel's, or `CWF_REGION_OVERRIDE` locally — forwards `x-cwf-region-<pillar>: restricted`
// to the route handlers and leaves a readable `cwf.region` cookie so funded CTAs paint their held state on the first
// frame. The region never redirects or blocks a page: reading is open everywhere.
import { NextResponse, type NextRequest } from "next/server";
import { COUNTRY_HEADERS, encodePosture, GEOFENCE_PILLARS, postureOf, REGION_COOKIE, REGION_HEADER } from "@cwf/core";
import { TRADE_COOKIE, tradeRedirect } from "./features/terminal/route";
import { SHELL_UA } from "./lib/app-shell";
import { canonicalRedirect } from "./lib/canonical-host";
import { docsRedirect } from "./lib/docs-url";
import { tickerHubRoute } from "./lib/ticker-href";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24;

export function proxy(request: NextRequest): NextResponse {
  // The docs are their own site (D-230): `/docs` and every `/docs/*` path answer a permanent 308 to the matching guide on
  // docs.mitoshi.xyz, on every host (so the old testnet host gets there in one hop).
  const guide = docsRedirect(request.nextUrl.pathname);
  if (guide) return NextResponse.redirect(guide, 308);
  // One address (D-228): the app lives at APP_ORIGIN (https://mitoshi.xyz); the old testnet host and www answer a
  // permanent redirect there with the path and query kept, and /.well-known/* answers on every host (the phone app's
  // association files: Apple and Google follow no redirect).
  const moved = canonicalRedirect(
    { host: request.headers.get("host"), pathname: request.nextUrl.pathname, search: request.nextUrl.search, method: request.method },
    { appOrigin: process.env.APP_ORIGIN, rpId: process.env.PASSKEY_RP_ID },
  );
  if (moved) return NextResponse.redirect(moved.location, moved.status);
  // The phone app opens on the product, never the marketing page (round 7, the owner's TestFlight review): its web view
  // marks every request `CWFShell/` in the user agent (lib/app-shell.ts), and `/` answers Markets. 307, not 308, so a
  // browser that once was the app keeps no permanent redirect.
  if (request.nextUrl.pathname === "/" && SHELL_UA.test(request.headers.get("user-agent") ?? "")) {
    const url = request.nextUrl.clone();
    url.pathname = "/markets";
    return NextResponse.redirect(url, 307);
  }
  // /dev fixtures are internal: 404 in production unless explicitly enabled (the layout also calls notFound()).
  if (request.nextUrl.pathname.startsWith("/dev") && process.env.NODE_ENV === "production" && process.env.DEV_FIXTURES !== "1") {
    return new NextResponse(null, { status: 404 });
  }
  // The terminal's address (D-192): `/trade` → the last symbol traded here; `/trade/btc` → `/trade/BTC`.
  const trade = tradeRedirect(request.nextUrl.pathname, request.cookies.get(TRADE_COOKIE)?.value);
  if (trade) {
    const url = request.nextUrl.clone();
    url.pathname = trade;
    return NextResponse.redirect(url, 307);
  }
  // A ticker's hub (R4-10, D-227): `/tickers/tsla` → `/tickers/TSLA`; an unlisted symbol is rewritten to `/tickers`,
  // which no page serves, so it answers the root 404 with status 404 (the URL stays what was typed).
  const hub = tickerHubRoute(request.nextUrl.pathname);
  if (hub) {
    const url = request.nextUrl.clone();
    url.pathname = hub === "missing" ? "/tickers" : hub.redirect;
    return hub === "missing" ? NextResponse.rewrite(url) : NextResponse.redirect(url, 307);
  }
  const country = process.env.CWF_REGION_OVERRIDE || COUNTRY_HEADERS.map((h) => request.headers.get(h)).find(Boolean) || null;
  const posture = postureOf(country);
  const held = encodePosture(posture);
  const headers = new Headers(request.headers);
  for (const pillar of GEOFENCE_PILLARS) {
    if (posture[pillar] === "restricted") headers.set(REGION_HEADER[pillar], "restricted");
    else headers.delete(REGION_HEADER[pillar]);
  }
  const response = NextResponse.next({ request: { headers } });
  if (held) {
    response.cookies.set({ name: REGION_COOKIE, value: held, path: "/", sameSite: "lax", httpOnly: false, maxAge: COOKIE_MAX_AGE_SEC });
  } else if (request.cookies.has(REGION_COOKIE)) {
    response.cookies.delete({ name: REGION_COOKIE, path: "/" });
  }
  return response;
}

/**
 * Everything but static payloads: `/api` is matched on purpose (funded routes read the stamped headers). `/docs` and
 * every `/docs/*` path are matched whatever they end in (D-230): the static-payload skip would otherwise leave
 * `/docs/llms.txt` or `/docs/x.png` to the app's 404 instead of the docs site (`proxy.test.ts`).
 */
export const config = {
  matcher: [
    "/docs",
    "/docs/:path*",
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp3|wav|mp4|webm|txt|xml|json)$).*)",
  ],
};
