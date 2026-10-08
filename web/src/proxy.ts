// Ported from Agari 03b30ab:web/src/proxy.ts — the geofence per pillar (plan C.3.5, Q-008 default) plus the /dev gate
// (C.3.6). Next 16's `proxy` (Node runtime, D-055). A restricted country — from a CDN's country header in front of
// Coolify (`cf-ipcountry`), Vercel's, or `CWF_REGION_OVERRIDE` locally — forwards `x-cwf-region-<pillar>: restricted`
// to the route handlers and leaves a readable `cwf.region` cookie so funded CTAs paint their held state on the first
// frame. Nothing here redirects or blocks a page: reading is open everywhere.
import { NextResponse, type NextRequest } from "next/server";
import { COUNTRY_HEADERS, encodePosture, GEOFENCE_PILLARS, postureOf, REGION_COOKIE, REGION_HEADER } from "@cwf/core";
import { TRADE_COOKIE, tradeRedirect } from "./features/terminal/route";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24;

export function proxy(request: NextRequest): NextResponse {
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
  const country = process.env.CWF_REGION_OVERRIDE || COUNTRY_HEADERS.map((h) => request.headers.get(h)).find(Boolean) || null;
  const posture = postureOf(country);
  const held = encodePosture(posture);
  const headers = new Headers(request.headers);
  headers.set("x-cwf-path", request.nextUrl.pathname);
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

/** Everything but static payloads: `/api` is matched on purpose (funded routes read the stamped headers). */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp3|wav|mp4|webm|txt|xml|json)$).*)"],
};
