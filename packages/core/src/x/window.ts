// Ported from Masayume 68f7a09:packages/core/src/x/window.ts and Owarine 90a91d71:packages/core/src/x/window.ts
// (`pickWindow`, the lane rule) — S11 (D-227): a stock trades on its 24/7 lane (Mitoshi's stocks share the 24/7 lanes
// with crypto, D-226), or on Regular where it has no 24/7 feed (PLTR, AMD).
import { phase } from "../lifecycle";
import { TICKERS } from "../market/tickers";
import type { EventMarket, LaneBasis } from "../types";
import type { XAsset, XInstruction } from "./parse";

export type XWindowCode = "no-window" | "window-entry-closed" | "window-not-started" | "opening-price-pending";
export type XWindowSelection = { ok: true; market: EventMarket } | { ok: false; code: XWindowCode; market?: EventMarket };

/**
 * The lanes that price a name, in the order a call tries them: crypto on its 24/7 lane; a stock on its 24/7 lane (the
 * signed 24/7 feed, where every stock surface trades), then Regular (the NYSE session; the only lane of a name with no
 * 24/7 feed). Never the Gap lane: one Window a week is not a 5m/15m/1h call.
 */
export function xLanesOf(asset: XAsset): readonly LaneBasis[] {
  return TICKERS[asset].kind === "crypto" ? ["crypto24"] : ["stock24", "regular"];
}

/**
 * The soonest Window a caller may enter, or the nearest reason it may not: enterable, waiting on its open, closed, not
 * started — in the order a reader cares about.
 */
export function pickWindow(markets: readonly EventMarket[], nowMs: number): XWindowSelection {
  const matching = [...markets].sort((a, b) => a.expirySec - b.expirySec);
  const trading = matching.find((m) => phase(m, nowMs) === "trading");
  if (trading) return { ok: true, market: trading };
  const pending = matching.find((m) => phase(m, nowMs) === "pendingOpeningPrint");
  if (pending) return { ok: false, code: "opening-price-pending", market: pending };
  const closed = matching.find((m) => ["noEntryBuffer", "locked"].includes(phase(m, nowMs)));
  if (closed) return { ok: false, code: "window-entry-closed", market: closed };
  const upcoming = matching.find((m) => phase(m, nowMs) === "upcoming");
  if (upcoming) return { ok: false, code: "window-not-started", market: upcoming };
  return { ok: false, code: "no-window" };
}

/** Match the asked name and duration exactly, on the lanes that price that name; never substitute another trade. */
export function selectXWindow(markets: readonly EventMarket[], instruction: Pick<XInstruction, "asset" | "intervalSec">, nowMs: number): XWindowSelection {
  let first: XWindowSelection | null = null;
  for (const lane of xLanesOf(instruction.asset)) {
    const picked = pickWindow(markets.filter((m) => m.asset === instruction.asset && m.intervalSec === instruction.intervalSec && m.lane === lane), nowMs);
    if (picked.ok) return picked;
    if (!first || (first.code === "no-window" && picked.code !== "no-window")) first = picked;
  }
  return first ?? { ok: false, code: "no-window" };
}
