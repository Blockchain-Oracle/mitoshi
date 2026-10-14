// The hero phone's screen as data (R6 landing L01), pure so the server's first paint and the live island draw the same
// thing: the state (`seeded`, `live`, `rolling`, `next`, `stale`, `unread`), the price, the Window chip and its ring,
// the line, the status ("UP ahead · +$14.28", price − open in E8) and the two side links with their pays. Every
// figure is read: a missing one is left out, never invented.
import { formatCadence } from "@cwf/core/market";
import { printUsd } from "../print-usd";
import { WORDS } from "../words";
import { paysText, sideHref, type HeroCandidate, type HeroPays } from "./hero-window";
import { lineGeometry, smooth, type LineGeometry, type LinePoint } from "./sparkline";

/** What the page seeds the hero with and `/api/landing/hero` answers (`hero.server.ts`). */
export interface HeroWire {
  window: HeroCandidate | null;
  pays: HeroPays;
  /** The line's last ten minutes, `[ms, priceE8]`, thinned for the first paint. */
  points: [number, string][];
  symbol: string;
  readAtMs: number;
}

export type HeroState = "seeded" | "live" | "rolling" | "next" | "stale" | "unread";

export interface HeroModel {
  state: HeroState;
  symbol: string;
  priceText: string | null;
  chip: string;
  /** What's left of the calls' time, 0..1, for the ring; null with no Window. */
  fraction: number | null;
  geo: LineGeometry | null;
  openText: string | null;
  status: { tone: "up" | "down" | "flat"; text: string } | null;
  up: { href: string; pays: string | null; label: string };
  down: { href: string; pays: string | null; label: string };
}

export interface HeroInput {
  window: HeroCandidate | null;
  pays: HeroPays;
  symbol: string;
  points: LinePoint[];
  /** The newest price, 8 decimals. */
  priceE8: string | null;
  nowMs: number;
  /** The island is mounted (a live countdown); false on the server (an absolute time). */
  live: boolean;
  stale: boolean;
}

export const CHART_W = 358;
export const CHART_H = 380;
export const LINE_SPAN_MS = 10 * 60_000;
/** Ten-second buckets over the ten minutes. */
const LINE_BUCKETS = 60;

const P = WORDS.phone;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const utc = (sec: number) => new Date(sec * 1000).toISOString().slice(11, 16);

function statusOf(priceE8: string | null, openE8: string | null): HeroModel["status"] {
  if (!priceE8 || !openE8) return null;
  const diff = BigInt(priceE8) - BigInt(openE8);
  if (diff === 0n) return { tone: "flat", text: P.level };
  const side = diff > 0n ? "UP" : "DOWN";
  const abs = printUsd(diff > 0n ? diff : -diff);
  return { tone: diff > 0n ? "up" : "down", text: P.ahead(side, `${diff > 0n ? "+" : "−"}${abs}`) };
}

export function heroModel({ window: w, pays, symbol, points, priceE8, nowMs, live, stale }: HeroInput): HeroModel {
  const nowSec = Math.floor(nowMs / 1000);
  const openE8 = w?.openPriceE8 ?? null;
  const open = openE8 ? Number(BigInt(openE8)) / 1e8 : null;
  const line = smooth(points, nowMs - LINE_SPAN_MS, LINE_SPAN_MS, LINE_BUCKETS);
  const geo = line.length > 0 || open !== null ? lineGeometry(line, CHART_W, CHART_H, open, LINE_SPAN_MS, nowMs) : null;
  const rolling = w !== null && nowSec >= w.cutoffSec;
  const state: HeroState = stale && live ? "stale" : !w ? (points.length > 0 ? "next" : "unread") : rolling ? "rolling" : live ? "live" : "seeded";
  const cadence = w ? formatCadence(w.cadenceSec) : null;
  const chip = !w ? P.next : rolling ? P.rolling : live ? `${cadence} · ${P.closesIn(clock(Math.max(0, w.cutoffSec - nowSec)))}` : `${cadence} · ${P.closesAt(utc(w.cutoffSec))}`;
  const fraction = w && !rolling ? Math.max(0, Math.min(1, (w.cutoffSec - nowSec) / Math.max(1, w.cutoffSec - w.tradingStartSec))) : null;
  const market = w && !rolling ? w.marketId : null;
  const where = w ? `${symbol} ${cadence}` : symbol;
  const upPays = market ? paysText(pays.upTicks) : null;
  const downPays = market ? paysText(pays.downTicks) : null;
  return {
    state,
    symbol,
    priceText: priceE8 ? printUsd(priceE8) : null,
    chip,
    fraction,
    geo,
    openText: openE8 ? P.opened(printUsd(openE8)) : null,
    status: w ? statusOf(priceE8, openE8) : { tone: "flat", text: P.nextLine },
    up: { href: sideHref(symbol, market, "up"), pays: upPays, label: P.label("UP", where, upPays) },
    down: { href: sideHref(symbol, market, "down"), pays: downPays, label: P.label("DOWN", where, downPays) },
  };
}
