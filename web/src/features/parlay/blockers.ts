/**
 * Why a parlay can't be placed right now — and the one tap that clears it (R6 games §4.4, T06; D-230 owner point 2).
 * The same shape as Range's (`CtaBlocker`), with the slip's own fixes: add a second leg, swap a thin or under-fair leg
 * to the next Window in its lane (or drop it while two remain, else move it to another asset), drop the longest leg of
 * a long shot. In the order a player meets them; the waits (the quote and the fair check, the first dollars) are
 * named, then honest when late.
 */
import type { Diagnosis } from "@cwf/core";
import { DEFAULT_AMOUNT_TEXT, type CtaBlocker, type WaitState } from "../range/blockers";
import { RANGE } from "../range/copy";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { laneKeyOf } from "./slip-state";

const B = PARLAY.block;
const R = RANGE.block;

export type ParlayFix =
  | { kind: "href"; href: string }
  | { kind: "add-leg" }
  | { kind: "amount"; text: string }
  | { kind: "swap-leg"; key: string; window: LegWindow }
  | { kind: "drop-leg"; key: string }
  | { kind: "retry-quote" }
  | { kind: "retry-funds" }
  | { kind: "add-money" };

export type ParlayBlocker = CtaBlocker<ParlayFix>;

export interface ParlayLegRef {
  key: string;
  marketId: string;
  laneKey: string;
}

export interface ParlayBlockInput {
  paused: boolean;
  legs: readonly ParlayLegRef[];
  amountZero: boolean;
  /** The quote's refusal (a thin leg arrives as `thinLeg`). */
  error: Diagnosis | null;
  /** The leg (0-based) the book refused as thin, from the refusal's figures. */
  thinLeg: number | null;
  quote: WaitState;
  capacity: Diagnosis | null;
  spotsDown: boolean;
  /** The leg (0-based) priced under the fair-value model past the reserve's slack. */
  underFairLeg: number | null;
  /** Each leg's win probability in bps from the last quote, for "Drop the longest leg"; null when none was priced. */
  legProbBps: readonly number[] | null;
  fitText: string | null;
  funding: WaitState;
  overBalance: { freeText: string; stakeText: string } | null;
  /** Every live Window, soonest close first. */
  windows: readonly LegWindow[];
}

const stated = (label: string, caption: string | null = null): ParlayBlocker => ({ label, caption, fix: null, alt: null, wait: false });
const fixed = (label: string, caption: string | null, fix: ParlayFix): ParlayBlocker => ({ label, caption, fix, alt: null, wait: false });
const waiting = (label: string): ParlayBlocker => ({ label, caption: null, fix: null, alt: null, wait: true });

/**
 * A refused leg's way out: the next Window in its own lane; with none, drop it while two legs remain; else the soonest
 * Window of another asset the slip doesn't hold.
 */
export function legFix(input: ParlayBlockInput, index: number, caption: string): ParlayBlocker {
  const leg = input.legs[index];
  if (!leg) return stated(B.swap(index + 1), caption);
  const held = new Set(input.legs.map((l) => l.marketId.toLowerCase()));
  const free = input.windows.filter((w) => w.model !== null && !held.has(w.market.marketId.toLowerCase()));
  const sameLane = free.find((w) => laneKeyOf(w) === leg.laneKey);
  if (sameLane) return fixed(B.swap(index + 1), caption, { kind: "swap-leg", key: leg.key, window: sameLane });
  if (input.legs.length > 2) return fixed(B.drop(index + 1), caption, { kind: "drop-leg", key: leg.key });
  const asset = leg.laneKey.split("|")[0];
  const other = free.find((w) => w.market.asset !== asset);
  return other ? fixed(B.swap(index + 1), caption, { kind: "swap-leg", key: leg.key, window: other }) : stated(B.swap(index + 1), caption);
}

const fitFix = (input: ParlayBlockInput) => {
  const fit = input.fitText ?? R.minFit;
  return fixed(R.useAmount(fit), R.overCap, { kind: "amount", text: fit.replace(/^\$/, "").replace(/,/g, "") });
};

function longShot(input: ParlayBlockInput): ParlayBlocker {
  const probs = input.legProbBps;
  if (!probs || probs.length !== input.legs.length) return stated(R.longShot, B.dropOne);
  const longest = probs.indexOf(Math.min(...probs));
  return fixed(B.dropLongest, R.longShot, { kind: "drop-leg", key: input.legs[longest]!.key });
}

export function parlayBlocker(input: ParlayBlockInput): ParlayBlocker | null {
  if (input.paused) return fixed(B.trade, B.paused, { kind: "href", href: "/markets" });
  if (input.legs.length < 2) return fixed(B.addLeg, B.needTwo, { kind: "add-leg" });
  if (input.amountZero) return fixed(R.useAmount(`$${DEFAULT_AMOUNT_TEXT}`), R.enterAmount, { kind: "amount", text: DEFAULT_AMOUNT_TEXT });
  if (input.thinLeg !== null) return legFix(input, input.thinLeg, B.thin(input.thinLeg + 1));
  if (input.error) {
    if (input.error.kind === "reserve-cap") return fitFix(input);
    if (input.error.errorName === "LongShot") return longShot(input);
    return fixed(R.retry, R.noQuote, { kind: "retry-quote" });
  }
  if (input.spotsDown) return fixed(R.retry, B.spotsDown, { kind: "retry-quote" });
  if (input.quote === "waiting") return waiting(R.pricing);
  if (input.quote === "late") return fixed(R.retry, R.quoteLate, { kind: "retry-quote" });
  if (input.capacity) return input.capacity.kind === "reserve-cap" ? fitFix(input) : fixed(R.retry, R.noQuote, { kind: "retry-quote" });
  if (input.underFairLeg !== null) return legFix(input, input.underFairLeg, B.underFair(input.underFairLeg + 1));
  if (input.funding === "waiting") return waiting(R.funding);
  if (input.funding === "late") return fixed(R.retry, R.fundingLate, { kind: "retry-funds" });
  if (input.overBalance) return fixed(R.addMoney, R.short(input.overBalance.freeText, input.overBalance.stakeText), { kind: "add-money" });
  return null;
}
