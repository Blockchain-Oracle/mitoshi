/**
 * The verdict pinned to the user's own position (D-048; ux-audit fixes 2 and 4): one card per wallet per Window that
 * walks Call → settling → stamped → paid, whoever redeems. The references derived the stamp from live holdings, so the
 * card vanished (or lied "Paid") once the settler's `redeemFor` auto-paid and deleted the position; here the engine's
 * own `Redeemed` event is the witness of payment (`by` ≠ holder = paid automatically, `heldAsCredit` = the wallet's
 * receive policy held it), and the legs come from what was redeemed when the live position is gone.
 */
import { deriveVerdict, type Address, type Holdings, type OnchainSnapshot, type Verdict } from "@cwf/core";
import type { EnginePosition } from "./lens";
import type { RedeemedView } from "./decode";

export type VerdictPhase =
  /** Trading: the call card (what you hold, what it pays if right). */
  | "call"
  /** Locked or awaiting the closing print / settlement. */
  | "settling"
  /** Settled; the payout (if any) is not in the wallet yet — auto-pay pending, or collect. */
  | "stamped"
  /** Settled and paid to the wallet (auto-paid by the settler, or collected by the wallet). */
  | "paid"
  /** Settled; the payout sits as engine credit because the wallet's TIP-403 receive policy refused it. */
  | "held";

export interface PinnedVerdict {
  phase: VerdictPhase;
  /** The stamp (win / loss / void) once settled; null before. */
  verdict: Verdict | null;
  /** Who moved the payout: the settler ("auto") or the wallet itself ("self"); null until paid. */
  paidBy: "auto" | "self" | null;
  /** The payout the chain moved (or held), from `Redeemed.total`; null before. */
  paidBase: bigint | null;
  txHash: `0x${string}` | null;
}

export interface PinInput {
  wallet: Address;
  snapshot: Pick<OnchainSnapshot, "marketId" | "state" | "winningOutcome" | "lockAtSec" | "decimals">;
  /** Head-fresh position (null = the engine holds nothing for the wallet here: never traded, or redeemed and deleted). */
  position: Pick<EnginePosition, "credit" | "yesFree" | "noFree" | "yesLocked" | "noLocked"> | null;
  lotBase: bigint;
  /** The wallet's `Redeemed` events on this Window, oldest first, each with its transaction. */
  redeemed: readonly (RedeemedView & { txHash: `0x${string}` })[];
  /** What the wallet paid in (fills ledger); null when unknown. */
  costBasisBase: bigint | null;
  settledAtMs: number | null;
  nowSec: number;
}

const lower = (a: string) => a.toLowerCase();

function heldOf(input: PinInput): Holdings {
  const p = input.position;
  if (p && p.yesFree + p.yesLocked + p.noFree + p.noLocked > 0n) return { upRaw: (p.yesFree + p.yesLocked) * input.lotBase, downRaw: (p.noFree + p.noLocked) * input.lotBase };
  // Redeemed and deleted: the legs are what the redemptions took (full redeems; partials add up).
  const up = input.redeemed.reduce((s, r) => s + r.yesLots, 0n);
  const down = input.redeemed.reduce((s, r) => s + r.noLots, 0n);
  return { upRaw: up * input.lotBase, downRaw: down * input.lotBase };
}

/** Null when the wallet never held anything on the Window (no card to pin). */
export function pinVerdict(input: PinInput): PinnedVerdict | null {
  const holdings = heldOf(input);
  const mine = input.redeemed.filter((r) => lower(r.holder) === lower(input.wallet));
  if (holdings.upRaw + holdings.downRaw === 0n && mine.length === 0) return null;
  if (input.snapshot.state === "open") {
    return { phase: input.nowSec < input.snapshot.lockAtSec ? "call" : "settling", verdict: null, paidBy: null, paidBase: null, txHash: null };
  }
  const verdict = deriveVerdict({
    marketId: input.snapshot.marketId, settlement: input.snapshot, holdings, feeBps: 0, decimals: input.snapshot.decimals,
    costBasisBase: input.costBasisBase, settledAtMs: input.settledAtMs,
  });
  const last = mine.at(-1) ?? null;
  const creditLeft = input.position?.credit ?? 0n;
  if (last?.heldAsCredit && creditLeft > 0n) {
    return { phase: "held", verdict, paidBy: null, paidBase: last.total, txHash: last.txHash };
  }
  const stillHeld = (input.position?.yesFree ?? 0n) + (input.position?.yesLocked ?? 0n) + (input.position?.noFree ?? 0n) + (input.position?.noLocked ?? 0n) > 0n;
  if (last && !stillHeld && !last.heldAsCredit && !(verdict?.outcome === "loss" && last.total === 0n)) {
    return { phase: "paid", verdict, paidBy: lower(last.by) === lower(input.wallet) ? "self" : "auto", paidBase: last.total, txHash: last.txHash };
  }
  // A held-as-credit payout the wallet later withdrew: paid by the wallet itself (its withdrawal carries no Redeemed).
  if (last?.heldAsCredit && creditLeft === 0n && !stillHeld) {
    return { phase: "paid", verdict, paidBy: "self", paidBase: last.total, txHash: last.txHash };
  }
  // Settled with nothing (yet) in the wallet: a win/void awaiting auto-pay or a collect, or a loss (nothing to pay).
  return { phase: "stamped", verdict, paidBy: null, paidBase: null, txHash: last?.txHash ?? null };
}
