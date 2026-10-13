// Ported from Owarine 90a91d71:web/src/features/strategies/{activity.ts,lifecycle.ts} (R4-6, D-227) — a copy's state
// from the wallet's own consent and grant (never from the strategy's aggregate counts). The runner's last pass is worded
// from its data (`features/agents/pulse.ts`, R6 #9), no longer recognised from its log line.
import { oneUnit, USD_DECIMALS, utcDayOf, type VaultCaps, type VaultGrant } from "@cwf/core";
import type { DotTone } from "@/components/kit/desk-kit";
import type { MinePayload, StrategyWire } from "./protocol";

export type CopyState = "not-copying" | "inactive" | "paused" | "expired" | "replaced" | "runner-changed" | "unfunded" | "low" | "copying" | "fading";

/** The most one contract can cost a copy: its price cap, or $1 with none — a contract pays $1, and the venue's smallest
 *  order is one (venue-spec grid: minLots × lotBase). */
export const contractCeilingBase = (caps: Pick<VaultCaps, "maxPriceRaw">) => (caps.maxPriceRaw > 0n ? caps.maxPriceRaw : oneUnit(USD_DECIMALS));

/**
 * A live budget against one contract (R6 #9): spent ("unfunded"), short of one contract at its price cap ("low"), or
 * enough (null). The runner sizes each call down to the budget (`runnerOrder`), so a low budget still fills a call
 * priced at or under what's left and skips one priced over it — not every call, and a budget under the per-trade cap
 * is not low while it covers a contract.
 */
export function budgetStateOf(grant: Pick<VaultGrant, "budgetBase" | "caps">): "unfunded" | "low" | null {
  if (grant.budgetBase <= 0n) return "unfunded";
  return grant.budgetBase < contractCeilingBase(grant.caps) ? "low" : null;
}

/** What's left, in whole cents: the most a contract can cost for a low budget to still fill it. */
export const budgetCentsOf = (grant: Pick<VaultGrant, "budgetBase">) => Number((grant.budgetBase * 100n) / oneUnit(USD_DECIMALS));

/** Registry consent alone is not permission to spend: the wallet's live grant must agree. */
export function copyStateOf(card: Pick<StrategyWire, "active" | "runner">, sub: MinePayload["subscriptions"][number] | null, grant: VaultGrant | null, nowSec: number): CopyState {
  if (!sub) return card.active ? "not-copying" : "inactive";
  if (!sub.active || grant?.revoked) return "paused";
  if (!grant || grant.grantId.toString() !== sub.grantId) return "replaced";
  if (grant.expiresAtSec <= nowSec) return "expired";
  if (grant.actor.toLowerCase() !== card.runner.toLowerCase()) return "runner-changed";
  return budgetStateOf(grant) ?? (sub.mode === "fade" ? "fading" : "copying");
}

export const COPY_STATE_LABEL: Record<CopyState, string> = {
  "not-copying": "Not copying", inactive: "Closed", paused: "Paused", expired: "Budget expired", replaced: "Budget replaced", "runner-changed": "Runner changed", unfunded: "Budget used up", low: "Budget low", copying: "Copying", fading: "Fading",
};

/** The state's dot: live only while every call can be copied — a low or spent budget warns, like the top-up below it. */
export const copyToneOf = (state: CopyState): DotTone => (state === "copying" || state === "fading" ? "live" : state === "not-copying" ? "quiet" : "warn");

/** Today's spend on a grant (0 once the UTC day has turned). */
export const spentTodayOf = (grant: VaultGrant, nowSec: number) => (grant.spentDay === utcDayOf(nowSec) ? grant.spentTodayBase : 0n);
