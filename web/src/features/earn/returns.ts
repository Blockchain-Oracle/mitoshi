// What a supplier earned, in words (R6 money, S09; D-230) — Senryo's EarnScreen rule ported (P5, D-325): the return
// since launch from the live share price (shares start at par, 1.0000, so it needs no history), a range's change from
// the reserve's own indexed history (last point over first), and "what $100 did" over the same span. Never a yield figure or a
// projection: only what the share price already did. Rounded half away from zero to 0.01 %; a change that rounds to
// zero is flat, never "−0.00%"; the minus is U+2212. Pure; prices are raw share prices (the reserve's decimals).

export type ReturnTone = "up" | "down" | "flat";

export interface ReturnRead {
  /** Signed basis points (0.01 %). */
  bps: number;
  tone: ReturnTone;
  /** "+1.23%", "−1.09%", "0.00%". */
  text: string;
}

const MINUS = "−";

/** (to / from − 1) in basis points, rounded half away from zero. */
export function changeBps(fromRaw: bigint, toRaw: bigint): number {
  if (fromRaw <= 0n) return 0;
  const scaled = (toRaw - fromRaw) * 100_000n / fromRaw; // tenths of a basis point
  const rounded = scaled >= 0n ? (scaled + 5n) / 10n : -((-scaled + 5n) / 10n);
  return Number(rounded);
}

export function returnRead(bps: number): ReturnRead {
  if (bps === 0) return { bps: 0, tone: "flat", text: "0.00%" };
  const abs = Math.abs(bps);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}%`;
  return bps > 0 ? { bps, tone: "up", text: `+${text}` } : { bps, tone: "down", text: `${MINUS}${text}` };
}

/** Since launch: shares started at par (`one`), so the live share price alone says it. */
export const sinceLaunch = (sharePriceRaw: bigint, one: bigint): ReturnRead => returnRead(changeBps(one, sharePriceRaw));

/** A range's change: its last point over its first; null with fewer than two points. */
export function rangeReturn(points: readonly { sharePriceRaw: bigint }[]): ReturnRead | null {
  if (points.length < 2) return null;
  return returnRead(changeBps(points[0]!.sharePriceRaw, points[points.length - 1]!.sharePriceRaw));
}

/** What $100 became over a span, in base units of `decimals`: 100 × last / first, floored to the cent. */
export function hundredBecame(firstRaw: bigint, lastRaw: bigint, decimals: number): bigint {
  if (firstRaw <= 0n) return 0n;
  const hundred = 100n * 10n ** BigInt(decimals);
  const cent = 10n ** BigInt(Math.max(0, decimals - 2));
  return ((hundred * lastRaw) / firstRaw / cent) * cent;
}

/** Whole days between two times (seconds), at least 0. */
export const ageDays = (fromSec: number, nowSec: number): number => Math.max(0, Math.floor((nowSec - fromSec) / 86_400));
