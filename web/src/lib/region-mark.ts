// Ported from Agari 03b30ab:web/src/lib/region-mark.ts — per pillar now (plan C.3.5): the vocabulary lives in
// `@cwf/core/region`; this file is the browser's half (the readable cookie) and stays runtime-agnostic so the proxy
// and route handlers can import it without React.
import { decodePosture, OPEN_POSTURE, REGION_COOKIE, type RegionPosture } from "@cwf/core";

export { COUNTRY_HEADERS, REGION_COOKIE, REGION_HEADER, postureOf, encodePosture } from "@cwf/core";

/** The posture the proxy left on this browser; open with no `document` (server render, workers). */
export function readRegionPosture(): RegionPosture {
  if (typeof document === "undefined") return OPEN_POSTURE;
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== REGION_COOKIE) continue;
    return decodePosture(decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return OPEN_POSTURE;
}
