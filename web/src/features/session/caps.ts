// Ported from Masayume 68f7a09:web/src/features/session/caps.ts — the caps form becomes three presets (21st 23552
// segmented control) and three lifetimes; the defaults are Masayume's (`CAPS_DEFAULTS`: 5 a tap, 25 a day, 4 Windows,
// 95¢, deposit 25) and the fallback reason for every refusal `simulateCaps` can return lives here (pure).
import { dailyHeadroomBase, oneCent, type Address, type CapRefusal, type GrantTerms, type VaultGrant } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { SESSION } from "./copy";

const ONE = 1_000_000n;
/** Dollars: whole amounts bare ("$25"), anything else to the cent ("$24.60"). */
export const usd = (base: bigint) => `$${formatBaseUnits(base, 6, base % ONE === 0n ? { minDp: 0, maxDp: 0 } : { minDp: 2, maxDp: 2 })}`;

/** What an EXIT grant may sell under the fair value at (D-193, D-213): "15%", or "15% or 10¢, whichever is more". */
export function exitAllowanceText(toleranceBps: number, slackBps?: number): string {
  const pct = `${(toleranceBps / 100).toFixed(toleranceBps % 100 === 0 ? 0 : 1)}%`;
  if (!slackBps) return pct;
  return `${pct} or ${(slackBps / 100).toFixed(slackBps % 100 === 0 ? 0 : 1)}¢, whichever is more`;
}

export type PresetId = "light" | "standard" | "big";
export type ExpiryId = "h6" | "h24" | "d7";

export interface CapsPreset {
  perTapBase: bigint;
  dailyBase: bigint;
  /** The budget set aside (= the deposit): one day of taps at the cap. */
  budgetBase: bigint;
  positions: number;
  priceCents: number;
}

export const PRESETS: Record<PresetId, CapsPreset> = {
  light: { perTapBase: 1n * ONE, dailyBase: 10n * ONE, budgetBase: 10n * ONE, positions: 4, priceCents: 95 },
  standard: { perTapBase: 5n * ONE, dailyBase: 25n * ONE, budgetBase: 25n * ONE, positions: 4, priceCents: 95 },
  big: { perTapBase: 10n * ONE, dailyBase: 50n * ONE, budgetBase: 50n * ONE, positions: 6, priceCents: 95 },
};
export const EXPIRY_SEC: Record<ExpiryId, number> = { h6: 6 * 3600, h24: 24 * 3600, d7: 7 * 86_400 };
export const DEFAULT_PRESET: PresetId = "standard";
export const DEFAULT_EXPIRY: ExpiryId = "h24";

export const presetOptions = (Object.keys(PRESETS) as PresetId[]).map((value) => ({ value, label: SESSION.presets[value] }));
export const expiryOptions = (Object.keys(EXPIRY_SEC) as ExpiryId[]).map((value) => ({ value, label: SESSION.expiries[value] }));

/** The grant the contract will hold for a preset and lifetime; the deposit is the budget (Masayume's "budget = deposit"). */
export function termsOf(preset: CapsPreset, expiry: ExpiryId, actor: Address, nowSec: number): { amountBase: bigint; terms: GrantTerms } {
  return {
    amountBase: preset.budgetBase,
    terms: {
      kind: "session",
      actor,
      caps: { maxStakePerTradeBase: preset.perTapBase, maxDailySpendBase: preset.dailyBase, maxOpenPositions: preset.positions, maxPriceRaw: BigInt(preset.priceCents) * oneCent(6), market: null },
      expiresAtSec: nowSec + EXPIRY_SEC[expiry],
      budgetBase: preset.budgetBase,
    },
  };
}

/** Taps a day the caps allow at the per-tap size (the worked example, not a slogan). */
export const tapsPerDay = (p: CapsPreset) => Number(p.dailyBase / p.perTapBase);

/** What the key can still spend right now: today's headroom, bounded by the budget. */
export const leftNowBase = (grant: VaultGrant, nowSec: number) => dailyHeadroomBase(grant, nowSec);

/** Today's spend on the grant's UTC day (0 on a new day). */
export const spentTodayBase = (grant: VaultGrant, nowSec: number) => (grant.spentDay === Math.floor(nowSec / 86_400) ? grant.spentTodayBase : 0n);

/** How much to add when the budget is the blocker: back to the daily cap (at least one tap at the per-tap cap). */
export function topUpBase(grant: VaultGrant): bigint {
  const want = grant.caps.maxDailySpendBase > grant.budgetBase ? grant.caps.maxDailySpendBase - grant.budgetBase : grant.caps.maxStakePerTradeBase;
  return want > 0n ? want : grant.caps.maxStakePerTradeBase;
}

export type FallbackFix = "add-budget" | "renew" | null;

/** The CTA's words for a refusal, and the one-step fix the CTA runs (null: the reason blocks until it passes). */
export function fallbackOf(refusal: CapRefusal, grant: VaultGrant): { reason: string; fix: FallbackFix } {
  const F = SESSION.fallback;
  switch (refusal.kind) {
    case "escrow":
      return grant.budgetBase < grant.caps.maxStakePerTradeBase ? { reason: F.budget(usd(topUpBase(grant))), fix: "add-budget" } : { reason: F.escrow(usd(topUpBase(grant))), fix: "add-budget" };
    case "daily":
      return { reason: F.daily(usd(refusal.capBase)), fix: null };
    case "stake":
      return { reason: F.stake(usd(refusal.capBase)), fix: null };
    case "price":
      return { reason: F.price(`${Number((refusal.capRaw * 100n) / ONE)}¢`), fix: null };
    case "positions":
      return { reason: F.positions(refusal.cap), fix: null };
    case "expired":
      return { reason: F.expired, fix: "renew" };
    case "revoked":
      return { reason: F.revoked, fix: null };
    case "market":
      return { reason: F.market, fix: null };
  }
}
