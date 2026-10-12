// Ported from Owarine 90a91d71:web/src/features/terminal/parlay/price.ts (`markParlay`, `legChance`) — D-227: an open
// parlay ticket and an open Range round as positions, at fair value now, in base units. A leg's chance is the guard's
// fair probability at the live spot (`fairProbUpE6`, its Series' σ); a band's is the chance the close prints inside it
// (P(above low) − P(above high)); with no live chance, the price it was bought at. A void ticket is its stake back, a
// lost one nothing. Integers throughout (probabilities in millionths).
import { fairProbUpE6, fairSideProbE6, type Side } from "@cwf/core";

export type LegStatus = "pending" | "won" | "lost" | "void";
const E6 = 1_000_000n;
const clampE6 = (p: bigint) => (p < 0n ? 0n : p > E6 ? E6 : p);

/** The chance a Window closes on `side` of `lineE8` with the asset at `spotE8` (millionths); null without the model. */
export function legChanceE6(side: Side, spotE8: bigint | null, lineE8: bigint | null, sigmaE8: bigint | null, tauSec: number): bigint | null {
  if (spotE8 === null || lineE8 === null || !sigmaE8 || spotE8 <= 0n || lineE8 <= 0n) return null;
  try {
    return fairSideProbE6(fairProbUpE6(spotE8, lineE8, sigmaE8, tauSec), side === "up" ? 0 : 1);
  } catch {
    return null;
  }
}

/** The chance the close prints inside `[lowE8, highE8]` (or outside it), on the same model. */
export function bandChanceE6(spotE8: bigint | null, lowE8: bigint, highE8: bigint, sigmaE8: bigint | null, tauSec: number, side: "inside" | "outside"): bigint | null {
  const above = (k: bigint) => legChanceE6("up", spotE8, k, sigmaE8, tauSec);
  const low = above(lowE8);
  const high = above(highE8);
  if (low === null || high === null) return null;
  const inside = clampE6(low - high);
  return side === "inside" ? inside : E6 - inside;
}

/** A ticket's worth now: a void leg voids it (the stake), a lost leg loses it, else the payout × every open leg's chance. */
export function markParlayBase(legs: ReadonlyArray<{ status: LegStatus; chanceE6: bigint | null; entryChanceE6: bigint }>, stakeBase: bigint, maxPayoutBase: bigint): bigint {
  if (legs.some((l) => l.status === "void")) return stakeBase;
  if (legs.some((l) => l.status === "lost")) return 0n;
  let v = maxPayoutBase;
  for (const l of legs) if (l.status === "pending") v = (v * clampE6(l.chanceE6 ?? l.entryChanceE6)) / E6;
  return v;
}

/** A round's worth now: the payout × the chance its band holds (the price it was bought at with no live chance). */
export const markRangeBase = (chanceE6: bigint | null, entryChanceE6: bigint, maxPayoutBase: bigint): bigint => (maxPayoutBase * clampE6(chanceE6 ?? entryChanceE6)) / E6;

/** A print in cents (the Range reserve's scale) as the feeds' e-8. */
export const printToE8 = (print: bigint): bigint => print * 1_000_000n;
