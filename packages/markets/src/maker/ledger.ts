/**
 * A supplier's lifetime counters on one house reserve (A-2c): everything they ever supplied and everything paid back
 * out, folded from the reserve's own `Supplied` / `SupplyRedeemed` events (every reserve emits the same two, `who`
 * indexed). The contracts keep no per-supplier totals, so this is the one honest source of a realized figure: money
 * that has actually come back above cost — never a rate, never a projection. Read from the reserve's deploy block in the
 * provider's ≤ 100k-block windows (D-030), a handful at a time; the page asks rarely and refreshes it after a write.
 */
import { parseAbiItem, type Address } from "viem";
import type { Reading, ReserveKind } from "@cwf/core";
import { leverageVenueOf } from "../leverage/deployment";
import { parlayVenueOf } from "../parlay/deployment";
import { rangeVenueOf } from "../range/deployment";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { makerVenueOf } from "./deployment";

const SUPPLIED = parseAbiItem("event Supplied(address indexed who, uint256 amount, uint256 shares, uint256 liquid)");
const REDEEMED = parseAbiItem("event SupplyRedeemed(address indexed who, uint256 amount, uint256 shares, uint256 liquid)");
/** The provider's largest `eth_getLogs` range (D-030). */
export const LEDGER_LOG_WINDOW = 100_000n;
/** Windows read at once: enough to cover a two-week-old reserve in a few round trips without tripping the rate limit. */
const PARALLEL = 6;

export interface SupplyLedger {
  suppliedBase: bigint;
  withdrawnBase: bigint;
  supplies: number;
  withdrawals: number;
  fromBlock: bigint;
  toBlock: bigint;
}

export type LedgerEntry = { kind: "supplied" | "redeemed"; amountBase: bigint };

/** The fold the reader applies to the events, on its own so it can be proved. */
export function foldSupplyLedger(entries: readonly LedgerEntry[], fromBlock: bigint, toBlock: bigint): SupplyLedger {
  const out: SupplyLedger = { suppliedBase: 0n, withdrawnBase: 0n, supplies: 0, withdrawals: 0, fromBlock, toBlock };
  for (const e of entries) {
    if (e.kind === "supplied") {
      out.suppliedBase += e.amountBase;
      out.supplies += 1;
    } else {
      out.withdrawnBase += e.amountBase;
      out.withdrawals += 1;
    }
  }
  return out;
}

/** The reserve a tab supplies, by kind: its address and deploy block on this chain, or null where it isn't deployed. */
export function reserveAt(kind: ReserveKind, chainId: number): { address: Address; fromBlock: bigint } | null {
  switch (kind) {
    case "maker": {
      const d = makerVenueOf(chainId);
      return d && { address: d.marketMakerVault, fromBlock: d.fromBlock };
    }
    case "range": {
      const d = rangeVenueOf(chainId);
      return d && { address: d.rangeReserve, fromBlock: d.fromBlock };
    }
    case "parlay": {
      const d = parlayVenueOf(chainId);
      return d && { address: d.parlayReserve, fromBlock: d.fromBlock };
    }
    case "boost": {
      const d = leverageVenueOf(chainId);
      return d && { address: d.leverageReserve, fromBlock: d.fromBlock };
    }
  }
}

/** Every `Supplied` and `SupplyRedeemed` the reserve emitted for `wallet`, folded; `null` inside the reading without a reserve. */
export async function getSupplyLedgerOf(kind: ReserveKind, wallet: Address): Promise<Reading<SupplyLedger | null>> {
  return withReading(`supplyLedger:${kind}:${wallet.toLowerCase()}`, async () => {
    const at = reserveAt(kind, (await getPublicClient()).chain.id);
    if (!at) return null;
    const client = await getLogClient();
    const head = await client.getBlockNumber();
    const ranges: [bigint, bigint][] = [];
    for (let start = at.fromBlock; start <= head; start += LEDGER_LOG_WINDOW) ranges.push([start, start + LEDGER_LOG_WINDOW - 1n < head ? start + LEDGER_LOG_WINDOW - 1n : head]);
    const entries: LedgerEntry[] = [];
    for (let i = 0; i < ranges.length; i += PARALLEL) {
      const batch = await Promise.all(
        ranges.slice(i, i + PARALLEL).flatMap(([fromBlock, toBlock]) => [
          client.getLogs({ address: at.address, event: SUPPLIED, args: { who: wallet }, fromBlock, toBlock }).then((logs) => logs.map((l) => ({ kind: "supplied" as const, amountBase: (l.args as { amount: bigint }).amount }))),
          client.getLogs({ address: at.address, event: REDEEMED, args: { who: wallet }, fromBlock, toBlock }).then((logs) => logs.map((l) => ({ kind: "redeemed" as const, amountBase: (l.args as { amount: bigint }).amount }))),
        ]),
      );
      for (const part of batch) entries.push(...part);
    }
    return foldSupplyLedger(entries, at.fromBlock, head);
  });
}
