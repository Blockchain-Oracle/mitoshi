/**
 * What a holder has on each side of the bridge, and how much the route can carry today (S14w; D-227 R4-12).
 * Robinhood: the Stock Token balance, its allowance to the lockbox, ETH for the fee and anything the lockbox owes.
 * Tempo: the mirror balance, the adapter's deferred credit and pathUSD for the out fee. Capacity: the lockbox's
 * outbound bucket toward Base and the adapter's inbound bucket (in), the adapter's outbound bucket (out) — all in 6 dp.
 */
import { erc20Abi, type Address, type PublicClient } from "viem";
import { diagnosis, err, toShared, LZ_EID, type BridgeDirection, type BridgeTicker, type Reading } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import { withReading } from "../runtime/reading";
import { stockLockboxAbi } from "@cwf/clients/abis/StockLockbox";
import { RH_DECIMALS } from "./params";
import type { BridgeClients } from "./clients";
import { bridgeTopology } from "./topology";

export interface RobinhoodHoldings {
  /** Wei. */
  eth: bigint;
  /** 18 dp. */
  stockLD: bigint;
  allowanceLD: bigint;
  /** What an unlock could not deliver to this wallet (claim it on Robinhood); 18 dp, 0 without a lockbox. */
  owedLD: bigint;
}

export interface TempoHoldings {
  mirrorSD: bigint;
  deferredSD: bigint;
  pathUsdBase: bigint;
}

/** The linked Robinhood wallet's side. The Stock Token itself is pinned, so balances read before the lockbox exists. */
export async function readRobinhoodHoldings(clients: BridgeClients, ticker: BridgeTicker, owner: Address): Promise<Reading<RobinhoodHoldings>> {
  const t = bridgeTopology(clients.network).tickers[ticker];
  if (!t.rhStock) return err(diagnosis("not-deployed", `no ${ticker} Stock Token on this network`));
  return withReading(`bridge:rh:${ticker}:${owner}`, async () => {
    const c = clients.robinhood;
    const [eth, stockLD, allowanceLD, owedLD] = await Promise.all([
      c.getBalance({ address: owner }),
      c.readContract({ address: t.rhStock!, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      t.lockbox ? c.readContract({ address: t.rhStock!, abi: erc20Abi, functionName: "allowance", args: [owner, t.lockbox] }) : Promise.resolve(0n),
      t.lockbox ? c.readContract({ address: t.lockbox, abi: stockLockboxAbi, functionName: "owed", args: [owner] }) : Promise.resolve(0n),
    ]);
    return { eth, stockLD, allowanceLD, owedLD };
  });
}

/** Every bridged ticker's Robinhood balance for the token picker (one multicall-free fan-out; five reads). */
export async function readRobinhoodBalances(clients: BridgeClients, owner: Address): Promise<Reading<Partial<Record<BridgeTicker, bigint>>>> {
  return withReading(`bridge:rh-all:${owner}`, async () => {
    const tickers = Object.values(bridgeTopology(clients.network).tickers).filter((t) => t.rhStock);
    const values = await Promise.all(tickers.map((t) => clients.robinhood.readContract({ address: t.rhStock!, abi: erc20Abi, functionName: "balanceOf", args: [owner] })));
    return Object.fromEntries(tickers.map((t, i) => [t.ticker, values[i]!]));
  });
}

/** The Tempo account's side. */
export async function readTempoHoldings(clients: BridgeClients, ticker: BridgeTicker, owner: Address): Promise<Reading<TempoHoldings>> {
  const t = bridgeTopology(clients.network).tickers[ticker];
  if (!t.adapter || !t.mirror) return err(diagnosis("not-deployed", `b${ticker} is not deployed on this network yet`));
  return withReading(`bridge:tempo:${ticker}:${owner}`, async () => {
    const c: PublicClient = clients.tempo;
    const [mirrorSD, deferredSD, pathUsdBase] = await Promise.all([
      c.readContract({ address: t.mirror!, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      c.readContract({ address: t.adapter!, abi: tIP20MintBurnAdapterAbi, functionName: "deferredOf", args: [owner] }),
      c.readContract({ address: TEMPO.pathUSD as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    ]);
    return { mirrorSD, deferredSD, pathUsdBase };
  });
}

export interface RouteCapacity {
  /** What can still cross today (6 dp), the tightest bucket on the way. */
  availableSD: bigint;
  capacitySD: bigint;
  windowSec: number;
}

/** The daily rate-limit room for a direction, shown before an amount is committed. */
export async function readRouteCapacity(clients: BridgeClients, ticker: BridgeTicker, direction: BridgeDirection): Promise<Reading<RouteCapacity>> {
  const t = bridgeTopology(clients.network).tickers[ticker];
  if (!t.adapter) return err(diagnosis("not-deployed", `the ${ticker} adapter is not deployed on this network yet`));
  if (direction === "in" && !t.lockbox) return err(diagnosis("not-deployed", `the ${ticker} lockbox is not deployed on this network yet`));
  return withReading(`bridge:capacity:${ticker}:${direction}`, async () => {
    if (direction === "out") {
      const [capacity, available, window] = await clients.tempo.readContract({ address: t.adapter!, abi: tIP20MintBurnAdapterAbi, functionName: "outboundLimit", args: [LZ_EID.baseSepolia] });
      return { availableSD: available, capacitySD: capacity, windowSec: Number(window) };
    }
    const [inbound, outbound] = await Promise.all([
      clients.tempo.readContract({ address: t.adapter!, abi: tIP20MintBurnAdapterAbi, functionName: "inboundLimit" }),
      clients.robinhood.readContract({ address: t.lockbox!, abi: stockLockboxAbi, functionName: "outboundLimit", args: [LZ_EID.baseSepolia] }),
    ]);
    const lockAvail = toShared(outbound[2], RH_DECIMALS);
    const lockCap = toShared(outbound[0], RH_DECIMALS);
    return { availableSD: lockAvail < inbound[1] ? lockAvail : inbound[1], capacitySD: lockCap < inbound[0] ? lockCap : inbound[0], windowSec: Number(inbound[2]) };
  });
}
