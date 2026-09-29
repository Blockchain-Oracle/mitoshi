// Ported from Masayume 68f7a09:packages/core/src/x/grant-policy.ts
import type { VaultCaps, VaultGrant } from "../vault/types";

// The deployed vault requires monetary cap fields. Their uint128 ceiling leaves the
// separately allocated budget as X's spending boundary, including after later top-ups.
export const X_MONETARY_CEILING = (1n << 128n) - 1n;
export const X_GRANT = { openWindows: 8, days: 30 } as const;

export function xGrantCaps(): VaultCaps {
  return { maxStakePerTradeBase: X_MONETARY_CEILING, maxDailySpendBase: X_MONETARY_CEILING, maxOpenPositions: X_GRANT.openWindows, maxPriceRaw: 0n };
}

export function isBalanceOnlyXGrant(grant: VaultGrant): boolean {
  return grant.kind === "executor" && grant.caps.maxStakePerTradeBase === X_MONETARY_CEILING
    && grant.caps.maxDailySpendBase === X_MONETARY_CEILING && grant.caps.maxPriceRaw === 0n;
}

export type XPermissionState = "checking" | "unavailable" | "unfunded" | "update" | "expired" | "mismatch" | "ready";

export function xPermissionState(grant: VaultGrant | null, executor: string | null, nowSec: number): XPermissionState {
  if (!executor) return "unavailable";
  if (!grant || grant.revoked) return "unfunded";
  if (grant.actor.toLowerCase() !== executor.toLowerCase()) return "mismatch";
  if (grant.expiresAtSec <= nowSec) return "expired";
  if (!isBalanceOnlyXGrant(grant)) return "update";
  return grant.budgetBase > 0n ? "ready" : "unfunded";
}
