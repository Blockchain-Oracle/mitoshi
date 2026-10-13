// Ported from Owarine 90a91d71:web/src/features/strategies/{activity.ts,lifecycle.ts} (R4-6, D-227) — a copy's state
// from the wallet's own consent and grant (never from the strategy's aggregate counts). The runner's last pass is worded
// from its data (`features/agents/pulse.ts`, R6 #9), no longer recognised from its log line.
import { utcDayOf, type VaultGrant } from "@cwf/core";
import type { MinePayload, StrategyWire } from "./protocol";

export type CopyState = "not-copying" | "inactive" | "paused" | "expired" | "replaced" | "runner-changed" | "unfunded" | "low" | "copying" | "fading";

/** A live budget too small for one full-size call (R6 #9): the runner sizes the order down to it, and below one
 *  contract's price it fills nothing — the copy then looks live while every call is skipped. Top it up. */
export const budgetLow = (grant: Pick<VaultGrant, "budgetBase" | "caps">) => grant.budgetBase > 0n && grant.budgetBase < grant.caps.maxStakePerTradeBase;

/** Registry consent alone is not permission to spend: the wallet's live grant must agree. */
export function copyStateOf(card: Pick<StrategyWire, "active" | "runner">, sub: MinePayload["subscriptions"][number] | null, grant: VaultGrant | null, nowSec: number): CopyState {
  if (!sub) return card.active ? "not-copying" : "inactive";
  if (!sub.active || grant?.revoked) return "paused";
  if (!grant || grant.grantId.toString() !== sub.grantId) return "replaced";
  if (grant.expiresAtSec <= nowSec) return "expired";
  if (grant.actor.toLowerCase() !== card.runner.toLowerCase()) return "runner-changed";
  if (grant.budgetBase <= 0n) return "unfunded";
  if (budgetLow(grant)) return "low";
  return sub.mode === "fade" ? "fading" : "copying";
}

export const COPY_STATE_LABEL: Record<CopyState, string> = {
  "not-copying": "Not copying", inactive: "Closed", paused: "Paused", expired: "Budget expired", replaced: "Budget replaced", "runner-changed": "Runner changed", unfunded: "Budget used up", low: "Budget low", copying: "Copying", fading: "Fading",
};

/** Today's spend on a grant (0 once the UTC day has turned). */
export const spentTodayOf = (grant: VaultGrant, nowSec: number) => (grant.spentDay === utcDayOf(nowSec) ? grant.spentTodayBase : 0n);
