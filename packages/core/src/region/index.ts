/**
 * The geofence's vocabulary (plan C.3.5; Agari 03b30ab:web/src/lib/region-mark.ts, per pillar). Pure: the proxy, the
 * route handlers, the relay policy and the browser all read it.
 *
 * A restricted visitor browses everything and funds nothing in that pillar: entry actions refuse (451 on the route,
 * the relay refuses the area's entry selectors), while every exit stays open — withdraw, redeem, claims, cash-out,
 * sell, bridge-out, unfollow. Disclosed as posture, not on-chain enforcement. Lists are Q-008's default.
 */
export const GEOFENCE_PILLARS = ["markets", "stocks", "launch"] as const;
export type GeofencePillar = (typeof GEOFENCE_PILLARS)[number];

/** ISO 3166-1 alpha-2, upper-case (Q-008 default: US browse-only markets; US/CA/GB/CH for Stock Tokens). */
export const RESTRICTED_COUNTRIES: Readonly<Record<GeofencePillar, ReadonlySet<string>>> = {
  markets: new Set(["US"]),
  stocks: new Set(["US", "CA", "GB", "CH"]),
  launch: new Set(),
};

export type PillarPosture = "open" | "restricted";
export type RegionPosture = Readonly<Record<GeofencePillar, PillarPosture>>;

export const OPEN_POSTURE: RegionPosture = { markets: "open", stocks: "open", launch: "open" };

/** Country headers the proxy trusts, in order: a CDN in front (Cloudflare), Vercel, or an operator-configured one. */
export const COUNTRY_HEADERS = ["cf-ipcountry", "x-vercel-ip-country"] as const;

/** Stamped on the forwarded request by the proxy, one per pillar, so a route never re-derives the verdict. */
export const REGION_HEADER: Readonly<Record<GeofencePillar, string>> = {
  markets: "x-cwf-region-markets",
  stocks: "x-cwf-region-stocks",
  launch: "x-cwf-region-launch",
};

/** Readable by the client on purpose: funded CTAs paint their restricted state on the first frame. */
export const REGION_COOKIE = "cwf.region";

export function normalizeCountry(country: string | null | undefined): string | null {
  const c = country?.trim().toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) ? c : null;
}

/** The posture for a country; no country (no header, local dev) is open, as in Agari. */
export function postureOf(country: string | null | undefined): RegionPosture {
  const c = normalizeCountry(country);
  if (!c) return OPEN_POSTURE;
  return {
    markets: RESTRICTED_COUNTRIES.markets.has(c) ? "restricted" : "open",
    stocks: RESTRICTED_COUNTRIES.stocks.has(c) ? "restricted" : "open",
    launch: RESTRICTED_COUNTRIES.launch.has(c) ? "restricted" : "open",
  };
}

export function isRestricted(posture: RegionPosture, pillar: GeofencePillar): boolean {
  return posture[pillar] === "restricted";
}

/** The cookie value: the restricted pillars, comma-separated (empty = open everywhere). */
export function encodePosture(posture: RegionPosture): string {
  return GEOFENCE_PILLARS.filter((p) => posture[p] === "restricted").join(",");
}

export function decodePosture(value: string | null | undefined): RegionPosture {
  const held = new Set((value ?? "").split(",").map((s) => s.trim()));
  return { markets: held.has("markets") ? "restricted" : "open", stocks: held.has("stocks") ? "restricted" : "open", launch: held.has("launch") ? "restricted" : "open" };
}

/** Reads the per-pillar headers the proxy stamped (a `Headers`-like object). */
export function postureFromHeaders(headers: { get(name: string): string | null }): RegionPosture {
  return {
    markets: headers.get(REGION_HEADER.markets) === "restricted" ? "restricted" : "open",
    stocks: headers.get(REGION_HEADER.stocks) === "restricted" ? "restricted" : "open",
    launch: headers.get(REGION_HEADER.launch) === "restricted" ? "restricted" : "open",
  };
}
