/**
 * Why a Range or Moonshot round can't be placed right now — and the one tap that clears it (R6 games §4.3.5, T06;
 * D-230 owner point 2: a blocker that names its fix IS the action). One mapping for both tickets (R4-5, D-227), in the
 * order a player meets them: the reserve, the model, the price, the amount, the book, the quote, the caps, the money.
 * The label is the fix ("Use $5", "Try BTC 15m →", "Widen the band") with the reason as one caption line; only where no
 * fix exists is it the stated block. "Try X →" always names a real priced Window (`pickAlt`), and a wait (the price,
 * the quote, the first dollars) is named, then honest when late — never a dead grey button.
 */
import type { Diagnosis, EventMarket } from "@cwf/core";
import { pickAlt, windowText, type AltCandidate, type AltRule } from "./alt-window";
import { RANGE } from "./copy";
import type { RangePresetKey } from "./presets";

const B = RANGE.block;

export type RangeFix =
  | { kind: "href"; href: string }
  | { kind: "window"; market: EventMarket }
  | { kind: "amount"; text: string }
  | { kind: "preset"; preset: RangePresetKey }
  | { kind: "rung"; multiple: number }
  | { kind: "retry-spot" }
  | { kind: "retry-quote" }
  | { kind: "retry-funds" }
  | { kind: "add-money" };

/** A blocker as its fix, generic over the fixes a ticket can run (Range's here, Parlay's legs in `parlay/blockers`). */
export interface CtaBlocker<F> {
  /** The fix's words when there is a fix, else the stated block (≤ 6 words). */
  label: string;
  /** One line of why under the CTA. */
  caption: string | null;
  fix: F | null;
  /** A second way out (the price feed is late: a Window whose own price is fresh). */
  alt: { label: string; fix: F } | null;
  /** A named wait, not a refusal. */
  wait: boolean;
}

export type RangeBlocker = CtaBlocker<RangeFix>;

/** waiting = still in time; late = past its limit (named, with Retry); ready = there. */
export type WaitState = "waiting" | "late" | "ready";

export interface RangeBlockInput {
  game: "range" | "moonshot";
  market: EventMarket;
  paused: boolean;
  hasModel: boolean;
  spot: WaitState;
  amountZero: boolean;
  /** Moonshot in payout mode over the rung's cap. */
  overRungCap: { multiple: number; capText: string; capAmountText: string } | null;
  /** The book's centre sits past the reserve's 2σ from the live price. */
  drifted: boolean;
  /** The quote's refusal, by its error name. */
  refusal: Diagnosis | null;
  quote: WaitState;
  /** The caps' refusal (`checkCapacity`) for a ready quote. */
  capacity: Diagnosis | null;
  /** Range: the band's side and width preset (widen or narrow). */
  band: { side: "inside" | "outside"; preset: RangePresetKey | null } | null;
  /** Moonshot: the rungs either side of the call (×lower for a long shot, ×higher for a near-certain one). */
  rung: { lower: number | null; higher: number | null } | null;
  /** The largest whole-dollar amount the reserve takes for this band ("$12"), or null when the room is unknown. */
  fitText: string | null;
  /** A new account's first dollars are landing and this order waits for them (signed in only). */
  funding: WaitState;
  /** Signed in and short. */
  overBalance: { freeText: string; stakeText: string } | null;
  /** The page's Windows; null where the ticket has no list to move along (the markets ticket's Range mode). */
  alts: readonly AltCandidate[] | null;
  isFresh?: (m: EventMarket) => boolean;
}

const stated = (label: string, caption: string | null = null): RangeBlocker => ({ label, caption, fix: null, alt: null, wait: false });
const fixed = (label: string, caption: string | null, fix: RangeFix): RangeBlocker => ({ label, caption, fix, alt: null, wait: false });
const waiting = (label: string): RangeBlocker => ({ label, caption: null, fix: null, alt: null, wait: true });

/** The DEFAULT stake the amount fix restores. */
export const DEFAULT_AMOUNT_TEXT = "5";

function tryWindow(input: RangeBlockInput, rule: AltRule, caption: string, fallback: RangeBlocker): RangeBlocker {
  const alt = input.alts ? pickAlt(rule, input.market, input.alts, input.isFresh) : null;
  return alt ? fixed(B.tryWindow(windowText(alt, RANGE.windows.gap)), caption, { kind: "window", market: alt }) : fallback;
}

const fitFix = (input: RangeBlockInput, caption: string) => {
  const fit = input.fitText ?? B.minFit;
  return fixed(B.useAmount(fit), caption, { kind: "amount", text: fit.replace(/^\$/, "").replace(/,/g, "") });
};

/** The long-shot / near-certain fix: Range moves the band's width, Moonshot the rung. */
function oddsFix(input: RangeBlockInput, longShot: boolean): RangeBlocker {
  const caption = longShot ? B.longShot : B.nearCertain;
  if (input.game === "moonshot") {
    const to = longShot ? input.rung?.lower : input.rung?.higher;
    return to ? fixed(B.tryRung(to), caption, { kind: "rung", multiple: to }) : stated(caption);
  }
  // A long shot inside wants a wider band; outside, a narrower one (and the reverse for near certain).
  const widen = longShot === (input.band?.side !== "outside");
  const preset: RangePresetKey = widen ? "wide" : "tight";
  if (input.band && input.band.preset !== preset) return fixed(widen ? B.widen : B.narrow, caption, { kind: "preset", preset });
  return stated(caption);
}

function refusalBlocker(input: RangeBlockInput, error: Diagnosis): RangeBlocker {
  const asset = input.market.asset;
  switch (error.errorName) {
    case "ThinBook":
      return tryWindow(input, "twin-or-cadence", B.thin(asset), stated(B.thinShort, B.pickAnother));
    case "WideBook":
      return tryWindow(input, "twin-or-cadence", B.wide(asset), stated(B.wideShort, B.pickAnother));
    case "StaleBasis":
      return tryWindow(input, "twin-or-cadence", B.lags(asset), stated(B.lagsShort, B.pickAnother));
    case "WindowDecided":
    case "TooLate":
    case "MarketNotTrading":
      return tryWindow(input, "longer", B.locksSoon, stated(B.locksSoonShort, B.pickAnother));
    case "TooFar":
      return tryWindow(input, "sooner", B.tooFar, stated(B.tooFarShort, B.pickAnother));
    case "LongShot":
      return oddsFix(input, true);
    case "NearCertain":
    case "Underpriced":
      return oddsFix(input, false);
    case "OverExpiryCap":
      return tryWindow(input, "next-expiry", B.expiryFull, fitFix(input, B.expiryFull));
    case "OverPayoutCap":
    case "OverExposure":
    case "InsufficientLiquidity":
      return fitFix(input, B.overCap);
    default:
      return error.kind === "reserve-cap" ? fitFix(input, B.overCap) : fixed(B.retry, B.noQuote, { kind: "retry-quote" });
  }
}

export function rangeBlocker(input: RangeBlockInput): RangeBlocker | null {
  const asset = input.market.asset;
  if (input.paused) return fixed(B.trade(asset), B.paused(input.game), { kind: "href", href: `/trade/${asset}` });
  if (!input.hasModel) return tryWindow(input, "other-asset", B.noModel(asset), stated(B.noModelShort, B.noModel(asset)));
  if (input.spot === "waiting") return waiting(B.waitingPrice);
  if (input.spot === "late") {
    const fresh = input.alts && input.isFresh ? pickAlt("fresh", input.market, input.alts, input.isFresh) : null;
    return { ...fixed(B.retry, B.spotLate, { kind: "retry-spot" }), alt: fresh ? { label: B.tryWindow(windowText(fresh, RANGE.windows.gap)), fix: { kind: "window", market: fresh } } : null };
  }
  if (input.amountZero) return fixed(B.useAmount(`$${DEFAULT_AMOUNT_TEXT}`), B.enterAmount, { kind: "amount", text: DEFAULT_AMOUNT_TEXT });
  if (input.overRungCap) return fixed(B.useCap(input.overRungCap.capText), B.rungCap(input.overRungCap.multiple, input.overRungCap.capText), { kind: "amount", text: input.overRungCap.capAmountText });
  if (input.drifted) return tryWindow(input, "twin-or-cadence", B.lags(asset), stated(B.lagsShort, B.pickAnother));
  if (input.refusal) return refusalBlocker(input, input.refusal);
  if (input.quote === "waiting") return waiting(B.pricing);
  if (input.quote === "late") return fixed(B.retry, B.quoteLate, { kind: "retry-quote" });
  if (input.capacity) return input.capacity.errorName === "OverExpiryCap" ? tryWindow(input, "next-expiry", B.expiryFull, fitFix(input, B.expiryFull)) : fitFix(input, B.overCap);
  if (input.funding === "waiting") return waiting(B.funding);
  if (input.funding === "late") return fixed(B.retry, B.fundingLate, { kind: "retry-funds" });
  if (input.overBalance) return fixed(B.addMoney, B.short(input.overBalance.freeText, input.overBalance.stakeText), { kind: "add-money" });
  return null;
}

export interface FitInput {
  /** The quote on screen. */
  stakeBase: bigint;
  maxPayoutBase: bigint;
  reserve: { liquidBase: bigint; lockedBase: bigint; totalValueBase: bigint; params: { maxExposureBps: number; maxExpiryLockedBase: bigint; maxPayoutCapBase: bigint } };
  /** What this expiry already locks (`lockedByExpiry`); null when it wasn't read. */
  lockedByExpiryBase: bigint | null;
  mode: "fixStake" | "fixPayout";
  decimals: number;
}

/**
 * The largest whole-dollar amount, in the ticket's own mode, the reserve takes for this band (the contract's
 * `_requireCapacity` and the pricing's payout cap, read in reverse): what the house fronts per $1 of stake is the payout
 * less the stake, so the stake that fits is the tightest room ÷ that, and never past the per-round payout cap. At least
 * $1; null when the expiry's room is unknown (the caller says "Use $1").
 */
export function fitAmountBase({ stakeBase, maxPayoutBase, reserve, lockedByExpiryBase, mode, decimals }: FitInput): bigint | null {
  if (lockedByExpiryBase === null || stakeBase <= 0n || maxPayoutBase <= stakeBase) return null;
  const { params } = reserve;
  const exposureRoom = (reserve.totalValueBase * BigInt(params.maxExposureBps)) / 10_000n - reserve.lockedBase;
  const expiryRoom = params.maxExpiryLockedBase - lockedByExpiryBase;
  const rooms = [reserve.liquidBase, exposureRoom, expiryRoom];
  const room = rooms.reduce((a, b) => (b < a ? b : a));
  const byRoom = room > 0n ? (room * stakeBase) / (maxPayoutBase - stakeBase) : 0n;
  const byCap = (params.maxPayoutCapBase * stakeBase) / maxPayoutBase;
  const stake = byRoom < byCap ? byRoom : byCap;
  const amount = mode === "fixStake" ? stake : (stake * maxPayoutBase) / stakeBase;
  const one = 10n ** BigInt(decimals);
  const whole = (amount / one) * one;
  return whole < one ? one : whole;
}
