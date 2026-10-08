// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/{lane-quote,gap-fair,token-fair}.ts
// — the xStock weekend reference and Jupiter token spot become RedStone's own 24/7 feed (`<T>---24_7`), which is the
// same source the 24/7 lane prints on; crypto quotes 24/7 on its RedStone feed (S3 "crypto σ").
/**
 * Per-lane phase, fair and cap. Regular Windows use the in-session model (spot vs the Window's open print, trading
 * time); the 24/7 lanes use the same z-score on calendar time; the Gap uses the 24/7 feed as its weekend reference
 * against Friday's print, 500 ± 150 blind when that feed is stale. Pure.
 */
import { haltAssetOf, haltOf, type HaltBoard, type LaneBasis, type SessionStatus, type TickerSymbol } from "@cwf/core";
import type { MarketView } from "@cwf/markets/ops";
import type { DisplayFeed } from "../../display/types";
import type { SpotFeed, SpotQuote } from "../../prices/spot";
import type { SeedMakerEnv } from "./env";
import { fairYesTicks, TRADING_YEAR_SEC } from "./fair";
import { divergenceGuard } from "./guard";
import { inExitTail, makerPhase, STOP_BEFORE_LOCK_SEC, tailHalfSpread, type MakerPhase } from "./quote";

export interface LaneQuote {
  phase: MakerPhase;
  fairTicks: number | null;
  maxCashPerWindow: bigint;
  halfSpreadTicks?: number;
  /** The exit tail (D-194): half the size at twice the spread, both sides kept for the exits. */
  tail?: boolean;
  why: string;
}

export interface LaneInput {
  lane: LaneBasis;
  symbol: TickerSymbol;
  market: MarketView;
  nowSec: number;
  status: SessionStatus | null;
  spot: SpotFeed | null;
  /** The chart line's feed: a risk signal only (`guard.ts`); null leaves the quote as the signed spot gives it. */
  display?: DisplayFeed | null;
  /** Wall time, for the display quote's age. */
  nowMs?: number;
  halts: HaltBoard;
  env: SeedMakerEnv;
}

const CALENDAR_YEAR_SEC = 365 * 86_400;
/** Calendar seconds as trading-time seconds, so one annual σ serves both clocks. */
export const tradingSecondsOf = (sec: number) => Math.floor((Math.max(0, sec) * TRADING_YEAR_SEC) / CALENDAR_YEAR_SEC);

export const GAP_BLIND_FAIR_TICKS = 500;
export const GAP_BLIND_HALF_SPREAD_TICKS = 150;
/** Weekend uncertainty at the Friday close as seconds of session variance (one session), shrinking with the span left. */
export const GAP_VARIANCE_SEC = 23_400;

function regular(i: LaneInput): LaneQuote {
  const cap = i.env.maxCashPerWindow;
  const halted = haltOf(i.halts, i.symbol);
  const inSession = i.status !== null && (i.status.state === "regular" || i.status.state === "early-close") && !halted;
  const spot = i.spot?.latest(i.symbol, i.env.spotMaxAgeSec) ?? null;
  const phase = makerPhase({ nowSec: i.nowSec, lockAtSec: i.market.lockAtSec, inSession, closesAtSec: i.status?.closesAtSec ?? null, spotFresh: spot !== null });
  if (phase !== "quote") return { phase, fairTicks: null, maxCashPerWindow: cap, why: halted ? `halted (${halted.reason})` : !spot ? `${i.symbol} spot stale` : phase };
  if (i.market.prints.open.source === 0) return { phase, fairTicks: null, maxCashPerWindow: cap, why: "waiting for the open print" };
  const fairAt = (spotE8: bigint) => fairYesTicks({ spotE8, openE8: i.market.prints.open.priceE8, secondsLeft: i.market.expirySec - i.nowSec, sigmaBps: i.env.sigmaBps(i.symbol), minTick: i.env.minTick });
  return guarded(i, spot!, fairAt, TRADING_YEAR_SEC, { phase, fairTicks: fairAt(spot!.priceE8), maxCashPerWindow: cap, why: `${i.symbol} ${spot!.priceE8} vs open ${i.market.prints.open.priceE8}` });
}

/** Applies the divergence guard to a quoting lane: widen by the display's shift of the fair, or pull. */
function guarded(i: LaneInput, spot: SpotQuote, fairAt: (spotE8: bigint) => number, yearSec: number, q: LaneQuote): LaneQuote {
  if (q.fairTicks === null || !i.display) return q;
  const g = divergenceGuard({
    signedE8: spot.priceE8, signedAtSec: spot.publishTimeSec, display: i.display.latest(i.symbol), nowMs: i.nowMs ?? Date.now(),
    sigmaBps: i.env.sigmaBps(i.symbol), yearSec, fairTicks: q.fairTicks, fairAt, halfSpreadTicks: q.halfSpreadTicks ?? i.env.halfSpreadTicks,
  });
  if (g.action === "pull") return { phase: "pull", fairTicks: null, maxCashPerWindow: q.maxCashPerWindow, why: g.note };
  return { ...q, fairTicks: g.fairTicks, halfSpreadTicks: g.halfSpreadTicks, why: g.note ? `${q.why} · ${g.note}` : q.why };
}

function allDay(i: LaneInput): LaneQuote {
  const cap = i.env.allDayMaxCash;
  const feed = i.lane === "stock24" ? (`${i.symbol}-24` as const) : i.symbol;
  const halt = haltOf(i.halts, haltAssetOf(i.symbol, i.lane));
  if (halt) return { phase: "pull", fairTicks: null, maxCashPerWindow: cap, why: `halted (${halt.reason})` };
  if (i.nowSec >= i.market.lockAtSec - STOP_BEFORE_LOCK_SEC) return { phase: "stop", fairTicks: null, maxCashPerWindow: cap, why: "before lock" };
  const spot = i.spot?.latest(feed, i.env.spotMaxAgeSec) ?? null;
  if (!spot) return { phase: "pull", fairTicks: null, maxCashPerWindow: cap, why: `${feed} spot stale` };
  if (i.market.prints.open.source === 0) return { phase: "quote", fairTicks: null, maxCashPerWindow: cap, why: "waiting for the open print" };
  const fairAt = (spotE8: bigint) => fairYesTicks({ spotE8, openE8: i.market.prints.open.priceE8, secondsLeft: tradingSecondsOf(i.market.expirySec - i.nowSec), sigmaBps: i.env.sigmaBps(i.symbol), minTick: i.env.minTick });
  return guarded(i, spot, fairAt, CALENDAR_YEAR_SEC, { phase: "quote", fairTicks: fairAt(spot.priceE8), maxCashPerWindow: cap, why: `${feed} ${spot.priceE8} vs open ${i.market.prints.open.priceE8}` });
}

function gap(i: LaneInput): LaneQuote {
  const cap = i.env.gapMaxCash;
  const m = i.market;
  const halted = haltOf(i.halts, i.symbol);
  if (halted || i.nowSec < m.tradingStartSec) return { phase: "pull", fairTicks: null, maxCashPerWindow: cap, why: halted ? `halted (${halted.reason})` : "Gap not trading yet" };
  if (i.nowSec >= m.lockAtSec - STOP_BEFORE_LOCK_SEC) return { phase: "stop", fairTicks: null, maxCashPerWindow: cap, why: "before the Sunday lock" };
  if (m.prints.open.source === 0) return { phase: "quote", fairTicks: null, maxCashPerWindow: cap, why: "waiting for the Friday print" };
  const ref = haltOf(i.halts, `${i.symbol}-24` as never) ? null : (i.spot?.latest(`${i.symbol}-24`, i.env.spotMaxAgeSec) ?? null);
  if (!ref) return { phase: "quote", fairTicks: GAP_BLIND_FAIR_TICKS, maxCashPerWindow: cap, halfSpreadTicks: Math.max(GAP_BLIND_HALF_SPREAD_TICKS, i.env.halfSpreadTicks), why: `no weekend reference: ${GAP_BLIND_FAIR_TICKS}` };
  const span = Math.max(1, m.expirySec - m.tradingStartSec);
  const left = Math.floor((GAP_VARIANCE_SEC * Math.min(span, Math.max(0, m.expirySec - i.nowSec))) / span);
  const fairTicks = fairYesTicks({ spotE8: ref.priceE8, openE8: m.prints.open.priceE8, secondsLeft: left, sigmaBps: i.env.sigmaBps(i.symbol), minTick: i.env.minTick });
  return { phase: "quote", fairTicks, maxCashPerWindow: cap, why: `${i.symbol}---24_7 reference` };
}

export function laneQuote(i: LaneInput): LaneQuote {
  const q = i.lane === "gap" ? gap(i) : i.lane === "stock24" || i.lane === "crypto24" ? allDay(i) : regular(i);
  return tailed(i, q);
}

/** In the Window's exit tail a quoting lane widens (twice the spread) and the window shrinks its size (`tailLots`). */
function tailed(i: LaneInput, q: LaneQuote): LaneQuote {
  if (q.phase !== "quote" || q.fairTicks === null || !inExitTail(i.nowSec, i.market.lockAtSec)) return q;
  return { ...q, tail: true, halfSpreadTicks: tailHalfSpread(q.halfSpreadTicks ?? i.env.halfSpreadTicks), why: `${q.why} · exit tail` };
}
