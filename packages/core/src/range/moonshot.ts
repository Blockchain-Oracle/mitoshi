// Ported from Masayume 68f7a09:packages/core/src/range/moonshot.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import { P_ONE, bandProbE6, floorStake, probitE4, quoteRange, sideProbRaw, stdE8, type RangeQuoteInput, type RangeQuoteResult } from "./pricing";

/**
 * Moonshot — Pips' direction-and-reach call (`games.ts` `resolveMoonshot`) priced by the live `RangeReserve`
 * as a band whose far edge saturates (doc 06 §"Moonshot — what the deployed parameters allow"). LONG is
 * P(close > K), SHORT is P(close < K), and K is solved so the contract's own multiple is the rung the
 * player chose. No contract of its own: the open is an ordinary `range-open` on a band the reserve already
 * prices, settles and pays.
 */

const BPS = BigInt(BPS_DENOMINATOR);
const E8 = 100_000_000n;
/** A strike is nudged a cent at a time; a solve that needs more than this many is a defect, not a long tail. */
const MAX_NUDGE_CENTS = 10_000;

/** Pips' reel of multiples: the 2× floor, the 25× lotto. */
export const MOONSHOT_RUNGS = [2, 3, 5, 10, 25] as const;
export type MoonshotRung = (typeof MOONSHOT_RUNGS)[number];
export type MoonshotDirection = "long" | "short";
export const MOONSHOT_DIRECTIONS: readonly MoonshotDirection[] = ["long", "short"];

/** Pips' AIM ladder: the sign is the side (up is LONG), the distance is the reach. Deepest SHORT at the floor, deepest LONG at the ceiling. */
export const MOONSHOT_AIM_LADDER = [-25, -10, -5, -3, -2, 2, 3, 5, 10, 25] as const;
export type MoonshotAim = (typeof MOONSHOT_AIM_LADDER)[number];

export interface MoonshotCall {
  direction: MoonshotDirection;
  multiple: MoonshotRung;
}

export function isMoonshotRung(n: number): n is MoonshotRung {
  return (MOONSHOT_RUNGS as readonly number[]).includes(n);
}

export function aimToCall(aim: number): MoonshotCall {
  const multiple = Math.abs(aim);
  if (!isMoonshotRung(multiple)) throw new Error(`no Moonshot rung at ${aim}`);
  return { direction: aim > 0 ? "long" : "short", multiple };
}

export function callToAim(call: MoonshotCall): MoonshotAim {
  return (call.direction === "long" ? call.multiple : -call.multiple) as MoonshotAim;
}

/**
 * The far edge of a LONG band: four times the opening print. On any Window inside `maxHorizonSec` that is
 * more than ninety standard deviations out, so `cdfE6` saturates to `P_ONE` and the band is P(close ≥ K).
 */
export const MOONSHOT_FAR_FACTOR = 4n;
/** The near edge of a SHORT band: one cent, the smallest print `_price`'s `lowPrint > 0` guard accepts. */
export const MOONSHOT_FLOOR_PRINT = 1n;

/** The fair probability that pays `multiple` after the house's margin: `p = 1 / (M × (1 + m))`, × 1e6. */
export function targetProbE6(multiple: number, marginBps: number): bigint {
  return (P_ONE * BPS) / (BigInt(multiple) * (BPS + BigInt(marginBps)));
}

/**
 * Whether the contract's stake for a one-unit payout at `probRaw` pays at least `multiple`. `floorStake` rounds
 * up twice, so this is stricter than `probRaw ≤ targetProbE6` by a base unit at some rungs — and because
 * `ceil(k·x) ≤ k·ceil(x)`, a rung that holds at one unit holds at every whole-unit payout.
 */
export function rungHolds(probRaw: bigint, multiple: number, one: bigint, marginBps: number): boolean {
  return floorStake(one, probRaw, one, marginBps) * BigInt(multiple) <= one;
}

export interface MoonshotBand {
  direction: MoonshotDirection;
  multiple: MoonshotRung;
  /** The level the print must finish beyond, in the oracle's cents. */
  strikePrint: bigint;
  lowPrint: bigint;
  highPrint: bigint;
  side: "inside";
}

/** The saturated band a strike becomes: LONG `[K, 4 × opening]`, SHORT `[1, K]`. */
export function moonshotBandEdges(direction: MoonshotDirection, openingPrint: bigint, strikePrint: bigint): { lowPrint: bigint; highPrint: bigint } {
  return direction === "long" ? { lowPrint: strikePrint, highPrint: openingPrint * MOONSHOT_FAR_FACTOR } : { lowPrint: MOONSHOT_FLOOR_PRINT, highPrint: strikePrint };
}

export interface SolveStrikeInput {
  direction: MoonshotDirection;
  multiple: MoonshotRung;
  openingPrint: bigint;
  centerQE6: bigint;
  sigmaE8: bigint;
  tauSec: number;
  marginBps: number;
  one: bigint;
}

/**
 * The strike, closed-form then nudged. With μ = Φ⁻¹(centreQ) and p the target: LONG needs 1 − Φ(z_K − μ) = p,
 * so z_K = μ + Φ⁻¹(1 − p); SHORT needs Φ(z_K − μ) = p, so z_K = μ + Φ⁻¹(p). `zOf` read backwards gives K.
 * The table, the probit and every division truncate, so K is then moved a cent at a time away from the
 * opening print until the mirror's own `bandProbE6` says the rung holds: rounding lands in the player's
 * favour on the multiple, as it lands in the house's on the stake.
 */
export function solveStrike(input: SolveStrikeInput): MoonshotBand {
  const { direction, multiple, openingPrint, centerQE6, sigmaE8, tauSec, marginBps, one } = input;
  if (openingPrint <= 0n) throw new Error(`a Moonshot needs a positive opening print, got ${openingPrint}`);
  const p = targetProbE6(multiple, marginBps);
  const std = stdE8(sigmaE8, tauSec);
  const mu = probitE4(centerQE6);
  const zK = mu + (direction === "long" ? probitE4(P_ONE - p) : probitE4(p));
  let strikePrint = openingPrint + (openingPrint * zK * std) / (10_000n * E8);
  const step = direction === "long" ? 1n : -1n;
  for (let i = 0; i < MAX_NUDGE_CENTS; i++) {
    const edges = moonshotBandEdges(direction, openingPrint, strikePrint);
    if (edges.highPrint > edges.lowPrint) {
      const probRaw = sideProbRaw(bandProbE6(openingPrint, edges.lowPrint, edges.highPrint, centerQE6, sigmaE8, tauSec), "inside", one);
      if (rungHolds(probRaw, multiple, one, marginBps)) return { direction, multiple, strikePrint, ...edges, side: "inside" };
    }
    strikePrint += step;
  }
  throw new Error(`the Moonshot strike did not converge for ${direction} ×${multiple} at ${openingPrint}`);
}

export type MoonshotQuoteInput = Omit<RangeQuoteInput, "lowPrint" | "highPrint" | "side"> & MoonshotCall;

export type MoonshotQuoteResult = ({ ok: true; band: MoonshotBand } & Extract<RangeQuoteResult, { ok: true }>) | Extract<RangeQuoteResult, { ok: false }>;

/** The solve and the reserve's own arithmetic on it, off one basis snapshot — the instant estimate the ticket shows before the chain answers. */
export function quoteMoonshot(input: MoonshotQuoteInput): MoonshotQuoteResult {
  const { direction, multiple, openingPrint, centerQE6, sigmaE8, tauSec, params, one } = input;
  const band = solveStrike({ direction, multiple, openingPrint, centerQE6, sigmaE8, tauSec, marginBps: params.marginBps, one });
  const result = quoteRange({ ...input, lowPrint: band.lowPrint, highPrint: band.highPrint, side: band.side });
  return result.ok ? { ok: true, band, quote: result.quote } : result;
}

export type RangeBandKind = { kind: "range" } | { kind: "moonshot"; direction: MoonshotDirection; strikePrint: bigint };

/** A round's shape says what it is: a band whose far edge is the saturating one is a Moonshot, with no storage needed. */
export function classifyRangeBand(openingPrint: bigint, lowPrint: bigint, highPrint: bigint): RangeBandKind {
  if (highPrint >= openingPrint * MOONSHOT_FAR_FACTOR) return { kind: "moonshot", direction: "long", strikePrint: lowPrint };
  if (lowPrint === MOONSHOT_FLOOR_PRINT) return { kind: "moonshot", direction: "short", strikePrint: highPrint };
  return { kind: "range" };
}

/**
 * The product's per-rung payout caps in whole units, under the contract's `maxPayoutCap`. A 25× round at the
 * contract's 500 cap locks ~482 of one expiry's 1,000 budget; these keep a single long shot from taking
 * half of it (doc 06 §Moonshot; the plan's option (c)). The contract remains the hard stop.
 */
export const MOONSHOT_PAYOUT_CAP_UNITS: Readonly<Partial<Record<MoonshotRung, number>>> = { 25: 100, 10: 200 };

export function moonshotPayoutCapBase(multiple: MoonshotRung, contractCapBase: bigint, one: bigint): bigint {
  const units = MOONSHOT_PAYOUT_CAP_UNITS[multiple];
  if (units === undefined) return contractCapBase;
  const product = BigInt(units) * one;
  return product < contractCapBase ? product : contractCapBase;
}
