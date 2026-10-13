/**
 * Range reads the Tempo seam adds: the PD-2/D-119 drift preview at a live spot (the rule `openRange` enforces with a
 * signed one, so the ticket names a `StaleBasis` before the hold), what the reserve holds after a refused payout
 * (P12), and the round an open booked (from its receipt's `RangeOpened`). R4-5 (D-227): a Window's model is read per
 * Series, σ falling back to the guard's as the redeployed reserve does.
 */
import { keccak256, parseEventLogs, toBytes, type Address, type Hex } from "viem";
import { deployments } from "@cwf/clients";
import type { Reading } from "@cwf/core";
import type { RangeRound } from "@cwf/core/range";
import { readWindows } from "../engine/lens";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { readFairModels } from "../parlay/read";
import { listRangesOf, listRecentRanges, reserveContract } from "./read";

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
  /** The σ the reserve prices this Window on: its own for the asset when set, else the guard's for the Series (R4-5). */
  sigmaE8: bigint;
  ticker: number;
  /** The guard's RedStone feed for the ticker (the open's spot proof), or null when it has none. */
  feed: string | null;
}

/**
 * Which Windows the reserve can price, keyed by Series id (lower case): the reserve's ticker for the asset, σ as
 * `RangePricing._sigma` reads it (the reserve's own for the asset, else the FairValueGuard's for the Series — R4-5,
 * D-227) and a spot the guard can verify; the rest refuse by name.
 */
export async function readRangeModels(windows: readonly { asset: string; seriesId: Hex }[]): Promise<Map<string, RangeModel>> {
  const out = new Map<string, RangeModel>();
  const c = await reserveContract();
  const client = await getPublicClient();
  const guard = byChain[String(client.chain.id)]?.fair?.contracts.FairValueGuard?.address as Address | undefined;
  if (!c || !guard || windows.length === 0) return out;
  const assets = [...new Set(windows.map((w) => w.asset))];
  const keys = assets.map((a) => keccak256(toBytes(a)));
  const [res, fair] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: keys.flatMap((k) => [
        { ...c, functionName: "volatilityOf" as const, args: [k] as const },
        { ...c, functionName: "tickerOf" as const, args: [k] as const },
      ]),
    }),
    readFairModels([...new Set(windows.map((w) => w.seriesId.toLowerCase() as Hex))]),
  ]);
  const byAsset = new Map(assets.map((a, i) => [a, { sigmaE8: res[2 * i] as bigint, ticker: Number(res[2 * i + 1] as number) }]));
  for (const w of windows) {
    const own = byAsset.get(w.asset)!;
    const series = fair.get(w.seriesId.toLowerCase());
    out.set(w.seriesId.toLowerCase(), { sigmaE8: own.sigmaE8 > 0n ? own.sigmaE8 : (series?.sigmaE8 ?? 0n), ticker: own.ticker, feed: own.ticker > 0 ? (series?.feed ?? null) : null });
  }
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

/** The latest rounds across every wallet with each Window read beside it (R6 games §5.4; the public floor's rows). */
export async function listRecentRangeRoundViews(limit = 12): Promise<Reading<RangeRoundView[]>> {
  return withReading(`rangeRecentViews:${limit}`, async (inner) => {
    const rounds = inner(await listRecentRanges(limit));
    const facts = await readWindows([...new Set(rounds.map((r) => r.marketId))]);
    return rounds.map((r) => {
      const f = facts.get(r.marketId);
      return { ...r, asset: f?.market.asset ?? null, intervalSec: f?.market.intervalSec ?? null, answered: f ? f.market.state !== "open" : false };
    });
  });
}
