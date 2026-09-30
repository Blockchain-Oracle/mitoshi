// Ported from Masayume 68f7a09:packages/core/src/vault/caps.ts — plus the D-091 Window scope (`Caps.market`), checked
// where `EventVault.placeFor` checks it: after the grant is live, before the market is resolved or priced.
import type { MarketId } from "../types/market";
import type { VaultGrant } from "./types";

const DAY_SEC = 86_400;

export type CapRefusal =
  | { kind: "revoked" }
  | { kind: "expired"; expiresAtSec: number }
  /** D-091: the grant is scoped to another Window (`OutsideGrantMarket`). */
  | { kind: "market"; scope: MarketId; marketId: MarketId | null }
  | { kind: "price"; sidePriceRaw: bigint; capRaw: bigint }
  | { kind: "escrow"; worstBase: bigint; budgetBase: bigint }
  | { kind: "stake"; spendBase: bigint; capBase: bigint }
  | { kind: "daily"; wouldBeBase: bigint; capBase: bigint }
  | { kind: "positions"; wouldBe: number; cap: number };

export type CapVerdict = { ok: true; headroomBase: bigint } | { ok: false; refusal: CapRefusal };

export interface CapCheckInput {
  grant: VaultGrant;
  nowSec: number;
  /** The Window the order is for; a scoped grant refuses any other (and refuses when this is unknown). */
  marketId?: MarketId | null;
  /** The order's price in the bought side's own terms (YES price, or 1 − it for NO). */
  sidePriceRaw: bigint;
  quantityRaw: bigint;
  /** What the fill would actually charge; the worst case (limit × quantity) when unknown. */
  spendBase: bigint;
  /** One whole unit of collateral (10^decimals). */
  one: bigint;
  opensNewPosition: boolean;
}

export function utcDayOf(sec: number): number {
  return Math.floor(sec / DAY_SEC);
}

/** The next 00:00 UTC — the copy says "resets 00:00 UTC", never "midnight your time" (AD-5 cap clock). */
export function capResetsAtSec(nowSec: number): number {
  return (utcDayOf(nowSec) + 1) * DAY_SEC;
}

/** What the grant has left today: the daily cap net of today's spend, bounded by the budget. */
export function dailyHeadroomBase(grant: VaultGrant, nowSec: number): bigint {
  const today = grant.spentDay === utcDayOf(nowSec) ? grant.spentTodayBase : 0n;
  const dailyLeft = grant.caps.maxDailySpendBase > today ? grant.caps.maxDailySpendBase - today : 0n;
  return dailyLeft < grant.budgetBase ? dailyLeft : grant.budgetBase;
}

/**
 * Mirrors `EventVault.placeFor` for a buy, check for check and in the contract's order:
 * live → Window scope (D-091) → price cap → escrow against the budget → per-trade cap → UTC-day cap → budget →
 * position cap. Golden-tested against `caps.vectors.json` beside this file, which the forge suite
 * (`contracts/test/products/vault/CapsVectors.t.sol`) asserts too.
 */
export function simulateCaps(input: CapCheckInput): CapVerdict {
  const { grant, nowSec, sidePriceRaw, quantityRaw, spendBase, one, opensNewPosition } = input;
  const { caps } = grant;
  if (grant.revoked) return { ok: false, refusal: { kind: "revoked" } };
  if (nowSec > grant.expiresAtSec) return { ok: false, refusal: { kind: "expired", expiresAtSec: grant.expiresAtSec } };
  const marketId = input.marketId?.toLowerCase() ?? null;
  if (caps.market !== null && caps.market.toLowerCase() !== marketId) {
    return { ok: false, refusal: { kind: "market", scope: caps.market, marketId: marketId as MarketId | null } };
  }
  if (caps.maxPriceRaw !== 0n && sidePriceRaw > caps.maxPriceRaw) {
    return { ok: false, refusal: { kind: "price", sidePriceRaw, capRaw: caps.maxPriceRaw } };
  }
  const worstBase = (quantityRaw * sidePriceRaw) / one;
  if (grant.budgetBase < worstBase) return { ok: false, refusal: { kind: "escrow", worstBase, budgetBase: grant.budgetBase } };
  if (spendBase > caps.maxStakePerTradeBase) return { ok: false, refusal: { kind: "stake", spendBase, capBase: caps.maxStakePerTradeBase } };
  const today = grant.spentDay === utcDayOf(nowSec) ? grant.spentTodayBase : 0n;
  if (today + spendBase > caps.maxDailySpendBase) {
    return { ok: false, refusal: { kind: "daily", wouldBeBase: today + spendBase, capBase: caps.maxDailySpendBase } };
  }
  if (grant.budgetBase < spendBase) return { ok: false, refusal: { kind: "escrow", worstBase: spendBase, budgetBase: grant.budgetBase } };
  if (opensNewPosition && grant.openPositions + 1 > caps.maxOpenPositions) {
    return { ok: false, refusal: { kind: "positions", wouldBe: grant.openPositions + 1, cap: caps.maxOpenPositions } };
  }
  return { ok: true, headroomBase: dailyHeadroomBase(grant, nowSec) - spendBase };
}
