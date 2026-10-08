/**
 * Reading a refusal back into figures the ticket can name (Masayume 68f7a09:web/src/features/parlay/format.ts
 * `parseThinBook`, moved beside the diagnosis that prints it): `ThinBook(market, filled, depth)` and the PD-2
 * `BelowFairValue(market, price, fair)` name a leg and two numbers, so the row says them instead of a tooltip.
 */
import { parseEventLogs, type Hex, type Log } from "viem";
import type { Diagnosis, MarketId } from "@cwf/core";
import { parlayReserveAbi } from "@cwf/clients/abis/ParlayReserve";

export type ParlayRefusalFigures =
  | { kind: "thin-book"; marketId: MarketId; filledRaw: bigint; depthRaw: bigint }
  | { kind: "below-fair"; marketId: MarketId; priceRaw: bigint; fairRaw: bigint };

export function parseRefusal(d: Diagnosis | null): ParlayRefusalFigures | null {
  if (!d?.errorName) return null;
  const m = /^\w+\((0x[0-9a-fA-F]{64}), (\d+), (\d+)\)$/.exec(d.technical);
  if (!m) return null;
  const [marketId, a, b] = [m[1] as MarketId, BigInt(m[2]!), BigInt(m[3]!)];
  if (d.errorName === "ThinBook") return { kind: "thin-book", marketId, filledRaw: a, depthRaw: b };
  if (d.errorName === "BelowFairValue") return { kind: "below-fair", marketId, priceRaw: a, fairRaw: b };
  return null;
}

/** What the reserve booked is what its `ParlayOpened` event says: the id and the stake it actually took. */
export function bookParlayOpen(logs: readonly Log[]): { parlayId: bigint; stakeBase: bigint } | null {
  const opened = parseEventLogs({ abi: parlayReserveAbi, eventName: "ParlayOpened", logs: logs as Log[] })[0];
  return opened ? { parlayId: opened.args.parlayId, stakeBase: opened.args.stake } : null;
}

export type { Hex };
