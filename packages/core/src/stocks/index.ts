/**
 * Stocks on Tempo — pure maths the stock pages share (plan S1 1a stub; S14w/S15 extend it; docs/specs/pillar2.md B.1).
 *
 * A bridged mirror (`bTSLA`) is a 6-decimal TIP-20 whose `ScaledUIView` exposes the source token's UI multiplier
 * (ERC-8056 face): `uiMultiplierOf(mirror)` = the pending multiplier once `now ≥ effectiveAt`, else the current one.
 * Balances are shown in UI amounts (`raw × multiplier / 1e18`), and prices follow the multiplier (× not ÷, B.3).
 */
export const MULTIPLIER_ONE = 1_000_000_000_000_000_000n;

export interface MultiplierState {
  currentE18: bigint;
  pendingE18: bigint;
  effectiveAtSec: number;
}

/** The multiplier in force at `nowSec` (StockSyncReceiver `uiMultiplierOf`). */
export function uiMultiplierAt(state: MultiplierState, nowSec: number): bigint {
  return nowSec >= state.effectiveAtSec && state.effectiveAtSec > 0 ? state.pendingE18 : state.currentE18;
}

/** Raw token units → UI units, rounded down (what a holder sees). */
export function uiAmountOf(raw: bigint, multiplierE18: bigint): bigint {
  if (multiplierE18 <= 0n) throw new Error("multiplier must be positive");
  return (raw * multiplierE18) / MULTIPLIER_ONE;
}

/** UI units → raw token units, rounded up (what a sell must move to deliver at least `ui`). */
export function rawAmountOf(ui: bigint, multiplierE18: bigint): bigint {
  if (multiplierE18 <= 0n) throw new Error("multiplier must be positive");
  return (ui * MULTIPLIER_ONE + multiplierE18 - 1n) / multiplierE18;
}

/** Token price from the share price: `tokenPriceE18 = sharePriceE18 × uiMultiplierE18 / 1e18` (B.3 StockGuard). */
export function tokenPriceE18(sharePriceE18: bigint, multiplierE18: bigint): bigint {
  return (sharePriceE18 * multiplierE18) / MULTIPLIER_ONE;
}

/** How old a quote is, in whole seconds, for the "quote age" tick on the ticket (E.3). */
export function quoteAgeSec(quotedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - quotedAtMs) / 1000));
}
