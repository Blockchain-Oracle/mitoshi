/**
 * The crowd reading the terminal shows beside the session cell (S6, L-04): the share of demand lots leaning UP on a
 * ticker. Ported in purpose from Agari 03b30ab `web/src/app/api/sentiment/crowd.ts` (Up share of the hour's taker lots,
 * null under 20 fills); testnet calls are far fewer, so the window widens instead of the bar dropping: the last day, else
 * the last week, and the reading names its window. Under `MIN_SIDES` in both, there is no reading — never a guess.
 */
import type { CrowdLean } from "@cwf/db/idx";

export const MIN_SIDES = 10;
export const CROWD_WINDOWS = [
  { sec: 86_400, label: "24 h" },
  { sec: 7 * 86_400, label: "7 d" },
] as const;

export interface CrowdReading {
  symbol: string;
  /** Basis points of the counted lots leaning UP (0–10,000); null when no window reached `MIN_SIDES`. */
  upBps: number | null;
  sides: number;
  /** The window the reading covers ("24 h" / "7 d"); null without a reading. */
  window: string | null;
  asOfSec: number;
}

/** UP's share of the leaning lots in basis points, rounded down; null when nothing leaned either way. */
export function upBpsOf(lean: Pick<CrowdLean, "upLots" | "downLots">): number | null {
  const total = lean.upLots + lean.downLots;
  return total === 0n ? null : Number((lean.upLots * 10_000n) / total);
}

/** The first window with enough demand sides, read through `leanSince`; the widest one's count when none has. */
export async function readCrowd(symbol: string, nowSec: number, leanSince: (sinceSec: number) => Promise<CrowdLean>): Promise<CrowdReading> {
  let sides = 0;
  for (const w of CROWD_WINDOWS) {
    const lean = await leanSince(nowSec - w.sec);
    sides = lean.sides;
    const upBps = upBpsOf(lean);
    if (lean.sides >= MIN_SIDES && upBps !== null) return { symbol, upBps, sides, window: w.label, asOfSec: nowSec };
  }
  return { symbol, upBps: null, sides, window: null, asOfSec: nowSec };
}
