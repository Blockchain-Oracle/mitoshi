// Ported from Agari 03b30ab:packages/core/src/lifecycle/phase.ts
import type { IndexedStatus, MarketState } from "../types/market";
import { msToSec } from "../units/time";
import { noEntryCutoffSec } from "./headroom";
import { ONCHAIN_STATUS } from "./status";

export type MarketPhase =
  | "upcoming"
  | "pendingOpeningPrint"
  | "trading"
  | "noEntryBuffer"
  | "locked"
  | "settledUnclaimed"
  | "finalized"
  | "voided";

export interface PhaseInput {
  tradingStartSec: number;
  /** Trading stops here; equal to `expirySec` except on the Gap lane. */
  lockAtSec: number;
  expirySec: number;
  intervalSec: number;
  openingPriceRaw: bigint | null;
  /** The engine's stored terminal state (a stored terminal state wins over the clock). */
  state: MarketState;
  /** The indexer's lagging view, when known. */
  status?: IndexedStatus;
  /** Head-fresh on-chain status when known; it overrides the lagging indexer status. */
  onchainStatus?: number | null;
}

const ENTERABLE: ReadonlySet<MarketPhase> = new Set<MarketPhase>(["trading"]);

function timePhase(m: PhaseInput, nowSec: number): MarketPhase {
  if (nowSec >= m.lockAtSec) return "locked";
  if (nowSec >= noEntryCutoffSec(m)) return "noEntryBuffer";
  if (nowSec < m.tradingStartSec) return "upcoming";
  if (m.openingPriceRaw === null) return "pendingOpeningPrint";
  return "trading";
}

function settledPhase(m: PhaseInput): MarketPhase {
  return m.status === "Finalized" ? "finalized" : "settledUnclaimed";
}

/** The single lifecycle function every surface derives from (AD-1). `nowMs` must come from the chain-corrected clock. */
export function phase(m: PhaseInput, nowMs: number): MarketPhase {
  const nowSec = msToSec(nowMs);
  const onchain = m.onchainStatus ?? null;
  if (onchain === ONCHAIN_STATUS.Voided || m.state === "voided" || m.status === "Voided") return "voided";
  if (onchain === ONCHAIN_STATUS.Resolved || m.state === "resolved" || m.status === "Resolved" || m.status === "Finalized") return settledPhase(m);
  if (onchain === ONCHAIN_STATUS.Locked || onchain === ONCHAIN_STATUS.Settling) return "locked";
  if (onchain === ONCHAIN_STATUS.Listed && nowSec < m.tradingStartSec) return "upcoming";
  return timePhase(m, nowSec);
}

export function isEnterable(p: MarketPhase): boolean {
  return ENTERABLE.has(p);
}

/** A Window listed before its open takes post-only calls that rest until the bell (D-088): the only restable phase. */
export function isRestable(p: MarketPhase): boolean {
  return p === "upcoming";
}

export function isSettled(p: MarketPhase): boolean {
  return p === "settledUnclaimed" || p === "finalized" || p === "voided";
}

/** How long a started Window may wait for its opening print before surfaces stop offering it (S24). */
export const OPENING_PRINT_GRACE_SEC = 120;

/**
 * A Window past its start whose opening print never came: a halted lane (a paused feed) or a Window that will void.
 * Lists drop it rather than show a card that waits for ever; the lifecycle itself is unchanged.
 */
export function isStalledOpening(m: PhaseInput, nowMs: number): boolean {
  return phase(m, nowMs) === "pendingOpeningPrint" && msToSec(nowMs) - m.tradingStartSec > OPENING_PRINT_GRACE_SEC;
}
