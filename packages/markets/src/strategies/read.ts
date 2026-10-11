// Ported from Masayume 68f7a09:packages/markets/src/strategies/read.ts — the record decodes the deployed registry's
// tuple (SSTORE2 metadata read through `metadataOf`, the agent id, the series scope; D-219), each read one Multicall3
// round trip through the read runtime. Lists for the board come from the index (S9.4); these are the chain's own
// answers the copy drawer and the runner check before acting.
import { hexToString, zeroHash, type Address, type Hex } from "viem";
import { TEMPO } from "@cwf/clients";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { SUBSCRIPTION_MODES, type SeriesId, type StrategyRecord, type StrategySubscription } from "@cwf/core";
import { getPublicClient } from "../runtime/read-runtime";
import { strategyVenueOf } from "./deployment";

/** `strategyOf` as viem decodes it. */
export interface StrategyTuple {
  creator: Address;
  runner: Address;
  specHash: Hex;
  metadataPointer: Address;
  metadataHash: Hex;
  agentId: bigint;
  envelope: { maxStakePerTrade: bigint; maxDailySpend: bigint; maxOpenPositions: number; maxPriceRaw: bigint; market: Hex };
  subscriptionFee: bigint;
  active: boolean;
  createdAtSec: bigint;
  subscribers: number;
  revision: number;
}

/** One record from the chain's tuple and its metadata bytes (UTF-8; "" when none). */
export function toStrategyRecord(strategyId: bigint, t: StrategyTuple, metadata: Hex): StrategyRecord {
  return {
    strategyId,
    creator: t.creator,
    runner: t.runner,
    specHash: t.specHash,
    metadata: metadata === "0x" ? "" : hexToString(metadata),
    metadataHash: t.metadataHash === zeroHash ? null : t.metadataHash,
    agentId: t.agentId === 0n ? null : t.agentId,
    envelope: {
      maxStakePerTradeBase: t.envelope.maxStakePerTrade,
      maxDailySpendBase: t.envelope.maxDailySpend,
      maxOpenPositions: Number(t.envelope.maxOpenPositions),
      maxPriceRaw: t.envelope.maxPriceRaw,
      series: t.envelope.market === zeroHash ? null : (t.envelope.market as SeriesId),
    },
    feeBase: t.subscriptionFee,
    active: t.active,
    createdAtSec: Number(t.createdAtSec),
    subscribers: Number(t.subscribers),
    revision: Number(t.revision),
  };
}

async function registry() {
  const client = await getPublicClient();
  const venue = strategyVenueOf(client.chain.id);
  return { client, contract: venue ? ({ address: venue.strategyRegistry, abi: strategyRegistryAbi } as const) : null };
}

/** One strategy as the chain holds it now (the fee and `active` the copy drawer confirms), or null (none / not deployed). */
export async function readStrategy(strategyId: bigint): Promise<StrategyRecord | null> {
  const { client, contract } = await registry();
  if (!contract || strategyId <= 0n) return null;
  const count = (await client.readContract({ ...contract, functionName: "strategyCount" })) as bigint;
  if (strategyId > count) return null;
  const [t, metadata] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { ...contract, functionName: "strategyOf", args: [strategyId] },
      { ...contract, functionName: "metadataOf", args: [strategyId] },
    ],
  })) as [StrategyTuple, Hex];
  return toStrategyRecord(strategyId, t, metadata);
}

/** A wallet's consent to one strategy and whether the runner may act on it now; null when it never subscribed. */
export async function readSubscription(strategyId: bigint, subscriber: Address): Promise<StrategySubscription | null> {
  const { client, contract } = await registry();
  if (!contract) return null;
  const [sub, live] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { ...contract, functionName: "subscriptionOf", args: [strategyId, subscriber] },
      { ...contract, functionName: "isSubscriptionLive", args: [strategyId, subscriber] },
    ],
  })) as [{ grantId: bigint; subscribedAtSec: bigint; mode: number; active: boolean }, boolean];
  if (sub.subscribedAtSec === 0n) return null;
  return { strategyId, subscriber, grantId: sub.grantId, subscribedAtSec: Number(sub.subscribedAtSec), active: sub.active, live, mode: SUBSCRIPTION_MODES[sub.mode] ?? "follow" };
}

/** Whether `marketId` is a Window this strategy trades (its series, or any) — the runner asks before each order. */
export async function readInScope(strategyId: bigint, marketId: Hex): Promise<boolean> {
  const { client, contract } = await registry();
  if (!contract) return false;
  return (await client.readContract({ ...contract, functionName: "inScope", args: [strategyId, marketId] })) as boolean;
}

const VALIDATE_RECEIVE_POLICY_ABI = [{ name: "validateReceivePolicy", type: "function", stateMutability: "view", inputs: [{ type: "address", name: "token" }, { type: "address", name: "sender" }, { type: "address", name: "receiver" }], outputs: [{ type: "bool", name: "authorized" }, { type: "uint8", name: "blockedReason" }] }] as const;

/**
 * Whether `receiver` accepts `token` from `sender` right now (TIP-403). Asked before a wallet pays a creator for a
 * memory read (S9.9b): a transfer the receiver's policy blocks still "succeeds" — into a guard — so the payment would
 * leave the wallet without reaching the creator, and the read would never open.
 */
export async function readReceiverAccepts(token: Address, sender: Address, receiver: Address): Promise<boolean> {
  const client = await getPublicClient();
  const [ok] = (await client.readContract({ address: TEMPO.tip403Registry as Address, abi: VALIDATE_RECEIVE_POLICY_ABI, functionName: "validateReceivePolicy", args: [token, sender, receiver] })) as readonly [boolean, unknown];
  return ok;
}
