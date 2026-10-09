/**
 * The earn-quoter's quote rule (S8 box 2; the shape of Masayume 68f7a09:services/ops/src/actors/market-maker/decide.ts on
 * Mitoshi's engine, with the rule `scripts/drive/parlay-live.ts maker` proved live for S10): the S8 maker vault rests a
 * bid and an ask a fixed half spread around the FairValueGuard's model at the latest signed spot — the same model the
 * Range, Moonshot and Parlay reserves price against, so their depth sits where they look for it — inside the vault's
 * own band, never crossing what already rests (PostOnly), and no tighter than the vault's spread floor. A Window is
 * requoted only when its model has moved far enough to matter, so a quiet Window costs no gas.
 */

export interface QuoteInput {
  /** FairValueGuard.previewFairUpE6 at the latest signed spot: P(Up) × 10⁶. */
  fairUpE6: bigint;
  /** Best resting bid / ask in ticks (0 when that side is empty). */
  bestBidTicks: number;
  bestAskTicks: number;
  halfSpreadTicks: number;
  /** The vault's `minSpreadRaw`, `minPriceRaw` and `maxPriceRaw`, in ticks (1 tick = 1,000 raw). */
  minSpreadTicks: number;
  minTicks: number;
  maxTicks: number;
}

export type QuoteDecision = { kind: "quote"; bidTicks: number; askTicks: number; midTicks: number } | { kind: "skip"; why: string };

export function decideQuote(i: QuoteInput): QuoteDecision {
  const mid = Math.round(Number(i.fairUpE6) / 1000);
  let bid = Math.max(i.minTicks, mid - i.halfSpreadTicks);
  let ask = Math.min(i.maxTicks, mid + i.halfSpreadTicks);
  if (i.bestAskTicks > 0 && bid >= i.bestAskTicks) bid = i.bestAskTicks - 1;
  if (i.bestBidTicks > 0 && ask <= i.bestBidTicks) ask = i.bestBidTicks + 1;
  if (bid < i.minTicks || ask > i.maxTicks) return { kind: "skip", why: `the model (${mid}) sits outside the vault's band against the book` };
  if (ask - bid < i.minSpreadTicks) return { kind: "skip", why: `spread ${ask - bid} under the vault's floor ${i.minSpreadTicks}` };
  return { kind: "quote", bidTicks: bid, askTicks: ask, midTicks: mid };
}

export interface LastQuote {
  midTicks: number;
  atSec: number;
}

/** Quote a Window the vault hasn't quoted, or requote once its model has moved `moveTicks` or the quote is `maxAgeSec` old. */
export function needsQuote(last: LastQuote | undefined, midTicks: number, nowSec: number, moveTicks: number, maxAgeSec: number): boolean {
  if (!last) return true;
  return Math.abs(midTicks - last.midTicks) >= moveTicks || nowSec - last.atSec >= maxAgeSec;
}
