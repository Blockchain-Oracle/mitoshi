// Ported from Masayume 68f7a09:packages/core/src/games/lucky.ts
import type { MarketId, Side } from "../types/market";
import type { Hex } from "../types/primitives";
import { concatWords, hexWord, uintWord } from "./commitment";
import { INTERVAL_5M_SEC } from "./deck";

/**
 * Lucky, as pure data: the policy a draw is made under, the bytes a candidate set commits to, the rule
 * that turns a drawn reach into one live Window, and the streak a verified history adds up to.
 *
 * The honesty rule the whole mode hangs on (`04-game-system.md` §Mode truth): the seed and the real quote
 * are shown before anything is placed. The commitment proves the draw was not changed after the reels
 * moved; it does not prove the Window was chosen fairly, which is why the candidate set is hashed too and
 * why the policy version rides in the HMAC message — a draw made under one set of rules can never claim
 * another's guarantees (`06-game-architecture.md` §/games/lucky).
 */

/**
 * Version 1 (Masayume, 2026-09-04): BTC and ETH, the owner's 2/3/5/10/25 reach ladder, no 5m Windows, and two minutes
 * of headroom so a signature never lands on a Window that has already closed to entry.
 *
 * Version 2 (Mitoshi, R4-9, D-227): BTC, ETH and SOL (the venue's crypto Series, each live at 5m, 15m and 1h), the
 * same ladder and headroom, and still no 5m — the owner's standing deck rule, the one the duel keeps too.
 */
export const LUCKY_POLICY_VERSION = 2;
/** The asset universe the draw is over, pinned by the policy so a verifier replays the same list. */
export const LUCKY_ASSETS: readonly string[] = ["BTC", "ETH", "SOL"];
export const LUCKY_MULTIPLIERS: readonly number[] = [2, 3, 5, 10, 25];
/** Headroom for a human signature between the deal and the fill. */
export const LUCKY_MIN_HEADROOM_SEC = 120;
/** Excluded by the deck policy's own rule: 5m returns only with a measured end-to-end timing. */
export const LUCKY_EXCLUDED_INTERVAL_SEC = INTERVAL_5M_SEC;
/** Past this the live multiple has moved far enough from the dealt one that the card must say so. */
export const LUCKY_DRIFT_BPS = 1_000;

const BPS = 10_000;

/**
 * The exact bytes hashed into a candidate-set commitment: the policy version, the count, and the market ids
 * sorted — so the same set in any order commits to the same hash, and no two different sets to one.
 */
export function luckyCandidatePreimage(marketIds: readonly MarketId[], policyVersion: number): Hex {
  const sorted = [...new Set(marketIds.map((id) => id.toLowerCase() as MarketId))].sort();
  return concatWords([uintWord(BigInt(policyVersion)), uintWord(BigInt(sorted.length)), ...sorted.map(hexWord)]);
}

/** A live Window as the eligibility scan sees it. */
export interface LuckyCandidate {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  /** The venue's own trading status, already normalised by the market port. */
  trading: boolean;
}

export interface LuckyEligibility {
  minHeadroomSec?: number;
  excludedIntervalSec?: number;
}

/** The Windows a drawn asset may be placed on: trading now, with real life left, and not on the excluded cadence. */
export function eligibleLuckyWindows(candidates: readonly LuckyCandidate[], asset: string, nowSec: number, options: LuckyEligibility = {}): LuckyCandidate[] {
  const headroom = options.minHeadroomSec ?? LUCKY_MIN_HEADROOM_SEC;
  const excluded = options.excludedIntervalSec ?? LUCKY_EXCLUDED_INTERVAL_SEC;
  return candidates
    .filter((c) => c.asset === asset && c.trading && c.intervalSec !== excluded && c.expirySec - nowSec >= headroom)
    .sort((a, b) => a.expirySec - b.expirySec);
}

/** A candidate with the drawn side's quote at the stake. A Window the book cannot fill at all never reaches this list. */
export interface LuckyQuoted {
  marketId: MarketId;
  expirySec: number;
  avgPriceBps: number;
  partial: boolean;
}

/** The price, in basis points of a whole unit, at which a contract pays the target multiple. */
export function targetPriceBps(multiplier: number): number {
  if (!(multiplier > 1)) throw new Error(`a reach must be above 1×, got ${multiplier}`);
  return Math.round(BPS / multiplier);
}

/** The gross multiple a price implies, in hundredths (2.94× → 294), so no float reaches a screen. */
export function impliedMultipleHundredths(avgPriceBps: number): number {
  if (avgPriceBps <= 0) throw new Error("a multiple needs a positive price");
  return Math.round((BPS * 100) / avgPriceBps);
}

/**
 * The fillable, non-partial quote whose price sits closest to `1 / M`; ties go to the soonest expiry, so a
 * player is never handed a longer wait than the reach needs.
 */
export function chooseLuckyWindow<T extends LuckyQuoted>(quotes: readonly T[], targetMultiplier: number): T | null {
  const target = targetPriceBps(targetMultiplier);
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const quote of quotes) {
    if (quote.partial) continue;
    const distance = Math.abs(quote.avgPriceBps - target);
    if (distance < bestDistance || (distance === bestDistance && best !== null && quote.expirySec < best.expirySec)) {
      best = quote;
      bestDistance = distance;
    }
  }
  return best;
}

/** True when the live price has moved more than `toleranceBps` of the dealt one — Pips' "unreachable, solved X×". */
export function luckyDrifted(dealtBps: number, liveBps: number, toleranceBps = LUCKY_DRIFT_BPS): boolean {
  return Math.abs(liveBps - dealtBps) * BPS > dealtBps * toleranceBps;
}

/**
 * Where a draw is. `drawn` is dealt and unplaced; `placed` is signed but not yet found on the tape; `pending`
 * is a measured fill waiting on its Window; the four after it are what the chain decided, or what the wallet
 * did on the book before it could. `refused` is a real row: a thin venue, a declined signature or a fill
 * that crossed nothing all leave one. `unknown` is a send with no verdict yet — never guessed either way.
 */
export type LuckyResult = "drawn" | "placed" | "pending" | "won" | "lost" | "void" | "cashed-out" | "refused" | "unknown";

export const LUCKY_RESULTS: readonly LuckyResult[] = ["drawn", "placed", "pending", "won", "lost", "void", "cashed-out", "refused", "unknown"];

/** The results a settlement read decided — the only rows a streak or a board may count. */
export const LUCKY_VERIFIED: ReadonlySet<LuckyResult> = new Set<LuckyResult>(["won", "lost", "void"]);

export function isLuckyTerminal(result: LuckyResult): boolean {
  return result === "won" || result === "lost" || result === "void" || result === "cashed-out" || result === "refused";
}

/** The chain's verdict on a held side. A voided Window pays both sides their half and decides nothing. */
export function luckyVerdict(side: Side, winningOutcome: 0 | 1 | null, voided: boolean): Extract<LuckyResult, "won" | "lost" | "void"> {
  if (voided || winningOutcome === null) return "void";
  return (side === "up" ? 0 : 1) === winningOutcome ? "won" : "lost";
}

/**
 * Consecutive wins from the newest verified row. A loss ends it; a void decided nothing and is skipped, as
 * is every row the chain has not settled — a pending spin is not a streak-breaker any more than a streak.
 */
export function luckyStreak(rows: readonly { result: LuckyResult }[]): number {
  let streak = 0;
  for (const row of rows) {
    if (!LUCKY_VERIFIED.has(row.result) || row.result === "void") continue;
    if (row.result === "lost") break;
    streak += 1;
  }
  return streak;
}

/** The longest run of wins anywhere in the history, by the same rule, over rows in any order of age. */
export function luckyBestStreak(rows: readonly { result: LuckyResult }[]): number {
  let best = 0;
  let run = 0;
  for (const row of rows) {
    if (!LUCKY_VERIFIED.has(row.result) || row.result === "void") continue;
    run = row.result === "won" ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}
