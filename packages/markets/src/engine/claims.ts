/**
 * Claim-all (D-048; C.2.3 row "redeem / claim-all"): every leftover in as few sponsored transactions as possible —
 * `redeem(m)` for each settled Window the wallet still holds, then `withdrawCredit(m, amount)` for each Window whose
 * credit is waiting (a payout the settler held for a receive policy, cancel/eviction refunds). The relay co-signs at
 * most 8 calls per transaction (C.3.3), so the plan chunks; each chunk is one atomic tx.
 *
 * A Window whose payout the wallet's receive policy blocks is left out (the engine's own `redeem`/`withdrawCredit`
 * revert `ReceivePolicyBlocked`, which would sink the whole batch); it is surfaced as "held" instead.
 */
import type { Address } from "viem";
import { enumerateClaimables, type ClaimableRow, type EventMarket, type MarketId, type SettledHolding } from "@cwf/core";
import type { EnginePosition } from "./lens";
import { MAX_SPONSORED_CALLS, type Call } from "../tx/batch";
import { redeemCall, withdrawCreditCall } from "./calls";

export interface ClaimAllInput {
  engine: Address;
  /** Settled Windows the wallet holds a paying (or voided) side on. */
  redeem: readonly MarketId[];
  /** Windows with engine credit to withdraw. A Window listed in `redeem` too is only redeemed: its credit rides the payout. */
  credits: readonly { marketId: MarketId; amountBase: bigint }[];
}

export interface ClaimAllPlan {
  /** One entry per transaction, each ≤ 8 calls. */
  batches: Call[][];
  redeemed: MarketId[];
  withdrawn: MarketId[];
}

/** Builds the transactions; duplicates collapse, zero credits drop, and redeem already pays out a Window's credit. */
export function planClaimAll(input: ClaimAllInput, maxCalls: number = MAX_SPONSORED_CALLS): ClaimAllPlan {
  if (maxCalls < 1) throw new Error("maxCalls must be ≥ 1");
  const redeemed = [...new Set(input.redeem.map((m) => m.toLowerCase() as MarketId))];
  const redeemSet = new Set<string>(redeemed);
  const creditBy = new Map<string, bigint>();
  for (const c of input.credits) {
    const id = c.marketId.toLowerCase();
    if (c.amountBase <= 0n || redeemSet.has(id)) continue;
    const prev = creditBy.get(id) ?? 0n;
    creditBy.set(id, prev > c.amountBase ? prev : c.amountBase);
  }
  const withdrawn = [...creditBy.keys()] as MarketId[];
  const calls: Call[] = [
    ...redeemed.map((m) => redeemCall(input.engine, m)),
    ...withdrawn.map((m) => withdrawCreditCall(input.engine, m, creditBy.get(m)!)),
  ];
  const batches: Call[][] = [];
  for (let i = 0; i < calls.length; i += maxCalls) batches.push(calls.slice(i, i + maxCalls));
  return { batches, redeemed, withdrawn };
}

export interface ClaimSource {
  market: Pick<EventMarket, "marketId" | "asset" | "intervalSec" | "expirySec" | "decimals" | "state" | "winningOutcome" | "resolvedAtMs">;
  lotBase: bigint;
  position: Pick<EnginePosition, "credit" | "yesFree" | "noFree" | "yesLocked" | "noLocked">;
}

/**
 * The wallet's claimable rows (Masayume `enumerateClaimables`, engine units): a settled Window with a paying side still
 * held is a `win`/`void` row (legs at contract size, credit folded in); an open-or-settled Window with only credit is a
 * `credit` row. A losing side alone is never a row (canon #11). `mayPay` false marks every row held (receive policy).
 */
export function claimablesOf(sources: readonly ClaimSource[], mayPay: boolean): ClaimableRow[] {
  const settledHeld: SettledHolding[] = [];
  const creditOnly: ClaimableRow[] = [];
  for (const s of sources) {
    const yes = (s.position.yesFree + s.position.yesLocked) * s.lotBase;
    const no = (s.position.noFree + s.position.noLocked) * s.lotBase;
    const settled = s.market.state !== "open";
    if (settled && yes + no > 0n) settledHeld.push({ market: s.market, holdings: { upRaw: yes, downRaw: no }, feeBps: 0 });
    else if (s.position.credit > 0n) {
      creditOnly.push({
        kind: "credit", marketId: s.market.marketId, asset: s.market.asset, intervalSec: s.market.intervalSec, expirySec: s.market.expirySec, legs: [],
        netPayoutBase: s.position.credit, feeBps: 0, decimals: s.market.decimals, settledAtMs: s.market.resolvedAtMs, creditBase: s.position.credit,
      });
    }
  }
  const creditOf = new Map(sources.map((s) => [s.market.marketId.toLowerCase(), s.position.credit]));
  const rows = enumerateClaimables(settledHeld).map((r) => {
    const credit = creditOf.get(r.marketId.toLowerCase()) ?? 0n;
    return { ...r, creditBase: credit, netPayoutBase: r.netPayoutBase + credit };
  });
  // A settled Window whose held side lost still carries its credit: that credit is claimable on its own.
  for (const s of sources) {
    const id = s.market.marketId.toLowerCase();
    const held = (s.position.yesFree + s.position.yesLocked + s.position.noFree + s.position.noLocked) > 0n;
    if (s.market.state !== "open" && held && s.position.credit > 0n && !rows.some((r) => r.marketId.toLowerCase() === id)) {
      creditOnly.push({
        kind: "credit", marketId: s.market.marketId, asset: s.market.asset, intervalSec: s.market.intervalSec, expirySec: s.market.expirySec, legs: [],
        netPayoutBase: s.position.credit, feeBps: 0, decimals: s.market.decimals, settledAtMs: s.market.resolvedAtMs, creditBase: s.position.credit,
      });
    }
  }
  return [...rows, ...creditOnly].map((r) => ({ ...r, heldByReceivePolicy: !mayPay })).sort((a, b) => b.expirySec - a.expirySec);
}

/** The claim-all input for rows that can be claimed now (held rows are left for when the policy allows). */
export function claimAllInputOf(engine: Address, rows: readonly ClaimableRow[]): ClaimAllInput {
  const live = rows.filter((r) => !r.heldByReceivePolicy);
  return {
    engine,
    redeem: live.filter((r) => r.kind === "win" || r.kind === "void").map((r) => r.marketId),
    credits: live.filter((r) => r.kind === "credit").map((r) => ({ marketId: r.marketId, amountBase: r.creditBase ?? r.netPayoutBase })),
  };
}
