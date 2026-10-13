import "server-only";
// Ported from Agari 03b30ab:web/src/lib/region.server.ts — the server half of the geofence (plan C.3.5): every funded
// route answers this before it touches a key, a balance or a co-signature; reads never call it. The proxy's stamped
// headers first; the raw country header and the local override as a fallback so a route stays enforced even if the
// matcher stops covering it. Exits (withdraw, redeem, claims, cash-out, sell, unfollow) never call it.
import { COUNTRY_HEADERS, isRestricted, postureFromHeaders, postureOf, type GeofencePillar, type RegionPosture } from "@cwf/core";
import { serverEnv } from "./env";

export function requestPosture(req: Request): RegionPosture {
  const stamped = postureFromHeaders(req.headers);
  const override = serverEnv().regionOverride;
  const country = override ?? COUNTRY_HEADERS.map((h) => req.headers.get(h)).find(Boolean) ?? null;
  const raw = postureOf(country);
  return {
    markets: stamped.markets === "restricted" || raw.markets === "restricted" ? "restricted" : "open",
    stocks: stamped.stocks === "restricted" || raw.stocks === "restricted" ? "restricted" : "open",
    launch: stamped.launch === "restricted" || raw.launch === "restricted" ? "restricted" : "open",
  };
}

export function regionRestricted(req: Request, pillar: GeofencePillar): boolean {
  return isRestricted(requestPosture(req), pillar);
}

/** 451 Unavailable For Legal Reasons — the whole answer to a funded call from a held region. */
export function regionRestrictedResponse(pillar: GeofencePillar): Response {
  return Response.json({ error: "region_restricted", pillar }, { status: 451, headers: { "cache-control": "no-store" } });
}
