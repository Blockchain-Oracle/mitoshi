// Ported from Masayume 68f7a09:web/src/features/markets/ticket/ticket-guards.ts — ordered so the first fixable reason
// is the one the CTA names (the label IS the blocker, D-045). Funding (credit first, then the account, allowance) is
// re-checked by the order lane at send; here the balance sheet answers "enough?" before any prompt. A held region is
// browse-only (Q-008); exits stay open elsewhere.
import type { BlockerKind } from "@cwf/core/copy";
import type { MarketPhase } from "@cwf/core/lifecycle";
import type { Quote, Reading, Side } from "@cwf/core";
import { admissibilityBlocker, belowMinStake } from "@cwf/core";

export interface TicketBlockerInput {
  connected: boolean;
  connecting: boolean;
  rightChain: boolean;
  hasSigner: boolean;
  regionHeld: boolean;
  phase: MarketPhase | null;
  placing: boolean;
  side: Side | null;
  availableBase: bigint | null;
  stakeBase: bigint;
  decimals: number;
  quote: Reading<Quote | null> | null;
  quoting: boolean;
  quoteStale: boolean;
}

const PHASE_BLOCKERS: Partial<Record<MarketPhase, BlockerKind>> = {
  upcoming: "upcoming",
  pendingOpeningPrint: "pending-opening-print",
  noEntryBuffer: "no-entry-buffer",
  locked: "locked",
  settledUnclaimed: "locked",
  finalized: "locked",
  voided: "locked",
};

/** Everything before the quote: the session, the region, the Window, the stake against what can back it. */
export function commonBlocker(i: TicketBlockerInput, allow: { upcoming?: boolean } = {}): BlockerKind | null {
  if (!i.connected) return i.connecting ? "connecting" : "disconnected";
  if (!i.rightChain) return "wrong-chain";
  if (!i.hasSigner) return "connecting";
  if (i.regionHeld) return "region-restricted";
  if (i.placing) return "placing";
  if (i.phase === null) return "syncing";
  const phaseBlocker = allow.upcoming && i.phase === "upcoming" ? null : PHASE_BLOCKERS[i.phase];
  if (phaseBlocker) return phaseBlocker;
  if (i.availableBase === 0n) return "no-funds";
  if (i.side === null) return "no-side";
  if (i.stakeBase === 0n) return "no-stake";
  if (belowMinStake(i.stakeBase, i.decimals)) return "below-min-stake";
  if (i.availableBase !== null && i.stakeBase > i.availableBase) return "over-balance";
  return null;
}

export function deriveBlocker(i: TicketBlockerInput): BlockerKind | null {
  const common = commonBlocker(i);
  if (common) return common;
  if (i.quoting || i.quote === null) return "quoting";
  if (!i.quote.ok) return "stale-quote";
  if (i.quote.value === null) return "no-liquidity-at-size";
  // The book fills part of it: the guard names what the book can take and leaves the typed amount alone.
  if (i.quote.value.partial) return "over-book";
  const band = admissibilityBlocker(i.quote.value.avgPriceBps);
  if (band) return band;
  if (i.quoteStale) return "stale-quote";
  return null;
}
