/**
 * Boost reads the Tempo seam adds: the PD-2 ceiling at a live spot (the entry must not sit more than the reserve's
 * slack above the guard's model for the side — the rule `open` enforces with a signed spot), the position an open
 * booked (from its receipt's `Opened`), and what the reserve holds after a refused payout (P12).
 */
import { parseEventLogs, type Address, type Hex } from "viem";
import type { Reading, Side } from "@cwf/core";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { leverageReserveAbi } from "@cwf/clients/abis/LeverageReserve";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { leverageVenueOf } from "./deployment";
import { reserveContract } from "./read";

const P_ONE = 1_000_000n;

/** The guard's fair probability for `side` (× 1e6) on `marketId` at `spotE8`; null when the guard has no model. */
export async function previewBoostFair(marketId: Hex, side: Side, spotE8: bigint): Promise<bigint | null> {
  const client = await getPublicClient();
  const guard = leverageVenueOf(client.chain.id)?.guard;
  if (!guard) return null;
  try {
    const up = await client.readContract({ address: guard, abi: fairValueGuardAbi, functionName: "previewFairUpE6", args: [marketId, spotE8] });
    return side === "up" ? up : P_ONE - up;
  } catch {
    return null;
  }
}

/** What the reserve booked, from the receipt's `Opened` — the figures the placed card states (never a later requote). */
export async function readBoostOpened(txHash: Hex): Promise<{ positionId: bigint; leverageBps: number; quantityRaw: bigint; stakeBase: bigint; frontedBase: bigint } | null> {
  const receipt = await (await getPublicClient()).getTransactionReceipt({ hash: txHash });
  const opened = parseEventLogs({ abi: leverageReserveAbi, eventName: "Opened", logs: receipt.logs })[0];
  return opened ? { positionId: opened.args.positionId, leverageBps: Number(opened.args.leverageBps), quantityRaw: opened.args.quantityRaw, stakeBase: opened.args.stake, frontedBase: opened.args.fronted } : null;
}

export async function readBoostOwed(wallet: Address): Promise<Reading<bigint>> {
  return withReading(`boostOwed:${wallet}`, async () => {
    const c = await reserveContract();
    if (!c) return 0n;
    return (await getPublicClient()).readContract({ ...c, functionName: "owedOf", args: [wallet] });
  });
}
