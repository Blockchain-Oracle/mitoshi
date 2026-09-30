/**
 * Range reads the Tempo seam adds: the PD-2/D-119 drift preview at a live spot (the rule `openRange` enforces with a
 * signed one, so the ticket names a `StaleBasis` before the hold), what the reserve holds after a refused payout
 * (P12), and the round an open booked (from its receipt's `RangeOpened`).
 */
import { keccak256, parseEventLogs, toBytes, type Address, type Hex } from "viem";
import { deployments } from "@cwf/clients";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import type { Reading } from "@cwf/core";
import type { RangeRound } from "@cwf/core/range";
import { readWindows } from "../engine/lens";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { listRangesOf, reserveContract } from "./read";

const byChain = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> } | undefined>>;

/** σ × 1e4 between the book's centre and `spotE8` for the Window (the open refuses past `params.maxDriftE4`). */
export async function previewRangeDrift(marketId: Hex, asset: string, spotE8: bigint): Promise<bigint> {
  const c = await reserveContract();
  if (!c) throw new Error("RangeReserve is not deployed on this chain");
  const client = await getPublicClient();
  return client.readContract({ ...c, functionName: "previewDriftE4", args: [marketId, asset, spotE8] });
}

export async function readRangeOwed(wallet: Address): Promise<Reading<bigint>> {
  return withReading(`rangeOwed:${wallet}`, async () => {
    const c = await reserveContract();
    if (!c) return 0n;
    return (await getPublicClient()).readContract({ ...c, functionName: "owedOf", args: [wallet] });
  });
}

export async function readRangeOpened(txHash: Hex): Promise<{ roundId: bigint; stakeBase: bigint } | null> {
  const receipt = await (await getPublicClient()).getTransactionReceipt({ hash: txHash });
  const opened = parseEventLogs({ abi: rangeReserveAbi, eventName: "RangeOpened", logs: receipt.logs })[0];
  return opened ? { roundId: opened.args.roundId, stakeBase: opened.args.stake } : null;
}

export interface RangeModel {
  sigmaE8: bigint;
  ticker: number;
  /** The guard's RedStone feed for the ticker (the open's spot proof), or null when it has none. */
  feed: string | null;
}

/** Which assets the reserve can price (its own σ and ticker) with a spot the guard can verify; the rest refuse by name. */
export async function readRangeModels(assets: readonly string[]): Promise<Map<string, RangeModel>> {
  const out = new Map<string, RangeModel>();
  const c = await reserveContract();
  const client = await getPublicClient();
  const guard = byChain[String(client.chain.id)]?.fair?.contracts.FairValueGuard?.address as Address | undefined;
  if (!c || !guard || assets.length === 0) return out;
  const keys = assets.map((a) => keccak256(toBytes(a)));
  const res = await client.multicall({
    allowFailure: false,
    contracts: keys.flatMap((k) => [
      { ...c, functionName: "volatilityOf" as const, args: [k] as const },
      { ...c, functionName: "tickerOf" as const, args: [k] as const },
    ]),
  });
  const tickers = assets.map((_, i) => Number(res[2 * i + 1] as number));
  const sources = await client.multicall({ allowFailure: false, contracts: tickers.map((t) => ({ address: guard, abi: fairValueGuardAbi, functionName: "spotSourceOf" as const, args: [t] as const })) });
  assets.forEach((a, i) => {
    const [verifier, feedId] = sources[i] as unknown as readonly [Address, Hex];
    let feed = "";
    for (let j = 2; j < feedId.length; j += 2) {
      const ch = parseInt(feedId.slice(j, j + 2), 16);
      if (ch === 0) break;
      feed += String.fromCharCode(ch);
    }
    out.set(a, { sigmaE8: res[2 * i] as bigint, ticker: tickers[i]!, feed: /^0x0+$/.test(verifier) || tickers[i] === 0 ? null : feed });
  });
  return out;
}

export interface RangeRoundView extends RangeRound {
  asset: string | null;
  intervalSec: number | null;
  /** The engine has resolved or voided the Window: `settle` will decide the round. */
  answered: boolean;
}

/** One wallet's rounds with each Window read beside it (asset, cadence, whether the engine has answered). */
export async function listRangeRoundViews(wallet: Address): Promise<Reading<RangeRoundView[]>> {
  return withReading(`rangeViews:${wallet}`, async (inner) => {
    const rounds = inner(await listRangesOf(wallet));
    const facts = await readWindows([...new Set(rounds.map((r) => r.marketId))]);
    return rounds.map((r) => {
      const f = facts.get(r.marketId);
      return { ...r, asset: f?.market.asset ?? null, intervalSec: f?.market.intervalSec ?? null, answered: f ? f.market.state !== "open" : false };
    });
  });
}
