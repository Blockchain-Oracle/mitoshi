/**
 * Earn's reserves at any block (R6 money, S09; D-230): each reserve's sheet — liquid, committed, value, shares and the
 * share price — read with `blockNumber` on every call (the public RPC answers historical `eth_call`), plus that block's
 * own timestamp, so the ops `reserve-pricer` can backfill an hourly series from each reserve's deploy block and keep it
 * live. The figures are the contracts' own, combined as the web's sheet builders combine them (`@cwf/core` reserves):
 * the maker vault carries its own `sharePriceRaw`; the house reserves price a share as value over shares.
 */
import { parseAbi, type Address } from "viem";
import { sharePriceRawOf, USD_DECIMALS, type ReserveKind } from "@cwf/core";
import { leverageVenueOf } from "../leverage/deployment";
import { makerVenueOf } from "../maker/deployment";
import { parlayVenueOf } from "../parlay/deployment";
import { rangeVenueOf } from "../range/deployment";
import type { OpsClient } from "./client";

export interface ReserveVenue {
  kind: ReserveKind;
  address: Address;
  deployBlock: bigint;
}

export interface ReserveSample {
  reserve: ReserveKind;
  blockNumber: bigint;
  atSec: number;
  sharePriceRaw: bigint;
  totalValueBase: bigint;
  liquidBase: bigint;
  committedBase: bigint;
  supplyShares: bigint;
}

const READ_ABI = parseAbi([
  "function liquid() view returns (uint256)",
  "function locked() view returns (uint256)",
  "function outstanding() view returns (uint256)",
  "function totalDeployed() view returns (uint256)",
  "function totalValue() view returns (uint256)",
  "function supplyShares() view returns (uint256)",
  "function sharePriceRaw() view returns (uint256)",
]);
type ReadFn = "liquid" | "locked" | "outstanding" | "totalDeployed" | "totalValue" | "supplyShares" | "sharePriceRaw";

/** Every reserve Earn shows on this chain, in tab order; a reserve not deployed here is left out. */
export function reserveVenuesOf(chainId: number): ReserveVenue[] {
  const out: ReserveVenue[] = [];
  const maker = makerVenueOf(chainId);
  if (maker) out.push({ kind: "maker", address: maker.marketMakerVault, deployBlock: maker.fromBlock });
  const range = rangeVenueOf(chainId);
  if (range) out.push({ kind: "range", address: range.rangeReserve, deployBlock: range.fromBlock });
  const parlay = parlayVenueOf(chainId);
  if (parlay) out.push({ kind: "parlay", address: parlay.parlayReserve, deployBlock: parlay.fromBlock });
  const boost = leverageVenueOf(chainId);
  if (boost) out.push({ kind: "boost", address: boost.leverageReserve, deployBlock: boost.fromBlock });
  return out;
}

/** The reserve's sheet as the chain held it at `blockNumber`, with that block's time. */
export async function readReserveSheetAt(client: OpsClient, venue: ReserveVenue, blockNumber: bigint): Promise<ReserveSample> {
  const c = { address: venue.address, abi: READ_ABI } as const;
  const committedFn: ReadFn = venue.kind === "maker" ? "totalDeployed" : venue.kind === "boost" ? "outstanding" : "locked";
  const fns: ReadFn[] = ["liquid", committedFn, "supplyShares", ...(venue.kind === "maker" ? (["totalValue", "sharePriceRaw"] as const) : [])];
  const [block, figures] = await Promise.all([
    client.public.getBlock({ blockNumber }),
    client.public.multicall({ allowFailure: false, blockNumber, contracts: fns.map((functionName) => ({ ...c, functionName })) as never }) as unknown as Promise<bigint[]>,
  ]);
  const [liquid, committed, shares, makerValue, makerPrice] = figures;
  const totalValueBase = venue.kind === "maker" ? makerValue! : liquid! + committed!;
  return {
    reserve: venue.kind,
    blockNumber,
    atSec: Number(block.timestamp),
    sharePriceRaw: venue.kind === "maker" ? makerPrice! : sharePriceRawOf(totalValueBase, shares!, USD_DECIMALS),
    totalValueBase,
    liquidBase: liquid!,
    committedBase: committed!,
    supplyShares: shares!,
  };
}

/** Blocks per hour, measured from two block timestamps `span` blocks apart (Tempo's block time is not a constant). */
export async function blocksPerHour(client: OpsClient, head: bigint, span = 50_000n): Promise<bigint> {
  const from = head > span ? head - span : 0n;
  const [a, b] = await Promise.all([client.public.getBlock({ blockNumber: from }), client.public.getBlock({ blockNumber: head })]);
  const seconds = Number(b.timestamp - a.timestamp);
  return seconds > 0 ? BigInt(Math.max(1, Math.round((Number(head - from) * 3600) / seconds))) : 3600n;
}
