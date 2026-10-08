// Ported from Masayume 68f7a09:packages/markets/src/private/read.ts — on the Tempo read runtime.
import { PRIVATE_NOT_DEPLOYED, type PrivateBudget, type PrivateDeskState, type PrivateQuote, type PrivateSlot } from "@cwf/core/private";
import { diagnosis, err, ok, OUTCOME_TO_SIDE, SIDE_TO_OUTCOME, toMarketId, USD_DECIMALS, type Address, type Bytes32, type MarketId, type OutcomeIdx, type Reading, type Side } from "@cwf/core";
import type { PublicClient } from "viem";
import { privateDeskAbi } from "@cwf/clients/abis/PrivateDesk";
import { nowMs } from "../runtime/clock";
import { withReading } from "../runtime/reading";
import { getPublicClient } from "../runtime/read-runtime";
import { privateDeskOf } from "./deployment";
import { diagnosePrivate } from "./errors";

const ZERO_MARKET = `0x${"00".repeat(32)}`;

type SlotTuple = {
  marketId: `0x${string}`;
  outcomeIdx: number;
  fundedAtSec: bigint;
  mintedAtSec: bigint;
  settledAtSec: bigint;
  expirySec: bigint;
  quantityRaw: bigint;
  balance: bigint;
  costRaw: bigint;
  payout: bigint;
  swept: bigint;
};

type PreviewTuple = { quantityRaw: bigint; costRaw: bigint; limitYesRaw: bigint; priceRaw: bigint };

/** The public `params` getter flattens the struct into a tuple, in declaration order. */
type ParamsTuple = readonly [bigint, bigint, number];

async function viemClient(): Promise<PublicClient> {
  return (await getPublicClient()) as unknown as PublicClient;
}

export async function privateDeskContract() {
  const d = privateDeskOf((await getPublicClient()).chain.id);
  return d ? ({ address: d.privateDesk, abi: privateDeskAbi } as const) : null;
}

export function toPrivateSlot(slotId: Bytes32, s: SlotTuple): PrivateSlot {
  const minted = s.mintedAtSec !== 0n && s.marketId !== ZERO_MARKET;
  return {
    slotId,
    marketId: minted ? toMarketId(s.marketId) : null,
    side: minted ? OUTCOME_TO_SIDE[s.outcomeIdx as OutcomeIdx] : null,
    fundedAtSec: Number(s.fundedAtSec),
    mintedAtSec: Number(s.mintedAtSec),
    settledAtSec: Number(s.settledAtSec),
    expirySec: Number(s.expirySec),
    quantityRaw: s.quantityRaw,
    balanceBase: s.balance,
    costBase: s.costRaw,
    payoutBase: s.payout,
    sweptBase: s.swept,
  };
}

/** The desk's sheet, the pinned signer and its tunables in one multicall; null where no desk is deployed. */
export async function getPrivateDeskState(): Promise<Reading<PrivateDeskState | null>> {
  return withReading("privateDesk", async () => {
    const deployment = privateDeskOf((await getPublicClient()).chain.id);
    const contract = await privateDeskContract();
    if (!deployment || !contract) return null;
    const [params, desk, paused, pool, owed, inSlots] = await (await viemClient()).multicall({
      allowFailure: false,
      contracts: [
        { ...contract, functionName: "params" },
        { ...contract, functionName: "desk" },
        { ...contract, functionName: "paused" },
        { ...contract, functionName: "pool" },
        { ...contract, functionName: "owed" },
        { ...contract, functionName: "inSlots" },
      ],
    });
    const p = params as ParamsTuple;
    return {
      deployment,
      params: { minStakeBase: p[0], maxStakeBase: p[1], minTimeLeftSec: p[2] },
      desk: desk.toLowerCase() as Address,
      paused,
      poolBase: pool,
      owedBase: owed,
      inSlotsBase: inSlots,
      decimals: USD_DECIMALS,
    };
  });
}

export function toPrivateBudget(balanceBase: bigint, allowanceBase: bigint): PrivateBudget {
  return { balanceBase, allowanceBase, spendableBase: allowanceBase < balanceBase ? allowanceBase : balanceBase };
}

/** An owner's private balance and what the desk may spend of it; zeros (never an error) without a desk. */
export async function getPrivateBudget(owner: Address): Promise<Reading<PrivateBudget>> {
  return withReading(`privateBudget:${owner}`, async () => {
    const contract = await privateDeskContract();
    if (!contract) return toPrivateBudget(0n, 0n);
    const [balance, allowance] = await (await viemClient()).readContract({ ...contract, functionName: "budgetOf", args: [owner] });
    return toPrivateBudget(balance, allowance);
  });
}

export async function getPrivateSlot(slotId: Bytes32): Promise<Reading<PrivateSlot | null>> {
  return withReading(`privateSlot:${slotId}`, async () => {
    const contract = await privateDeskContract();
    if (!contract) return null;
    const s = await (await viemClient()).readContract({ ...contract, functionName: "slotOf", args: [slotId] });
    return toPrivateSlot(slotId, s as SlotTuple);
  });
}

/** The stake-first quote (`sizeForStake`): the size a stake affords off the live book, then that size priced. A refusal is the desk's reason, never a stale last-good. */
export async function sizePrivateForStake(marketId: MarketId, side: Side, stakeBase: bigint): Promise<Reading<PrivateQuote>> {
  const contract = await privateDeskContract();
  if (!contract) return err(diagnosis("not-deployed", PRIVATE_NOT_DEPLOYED));
  try {
    const p = (await (await viemClient()).readContract({ ...contract, functionName: "sizeForStake", args: [marketId as `0x${string}`, SIDE_TO_OUTCOME[side], stakeBase] })) as PreviewTuple;
    return ok({ side, stakeBase, quantityRaw: p.quantityRaw, costBase: p.costRaw, limitYesRaw: p.limitYesRaw, priceRaw: p.priceRaw, decimals: USD_DECIMALS, quotedAtMs: nowMs() }, nowMs());
  } catch (error) {
    return err(diagnosePrivate(error));
  }
}
