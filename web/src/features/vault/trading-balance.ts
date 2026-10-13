// The Trading Balance as the vault holds it for its owner (R4-4, D-227): free plus what every live grant may still spend.
// The vault invariant is wallet + engine credit = Σ available + private + Σ grant budgets, so a budget handed to
// tap-trading (or a strategy) is still the owner's money in the Trading Balance — the money card, the tile and the sheet
// all read this one sum.
import type { VaultSnapshot } from "@cwf/core";

export function tradingBalanceOf(snap: Pick<VaultSnapshot, "account" | "grants">): bigint {
  return snap.account.availableBase + grantBudgetsOf(snap);
}

/** What every live grant may still spend (the "In tap-trading" tile reads the session grant's part). */
export function grantBudgetsOf(snap: Pick<VaultSnapshot, "grants">): bigint {
  return Object.values(snap.grants).reduce((sum, g) => (g && !g.revoked ? sum + g.budgetBase : sum), 0n);
}
