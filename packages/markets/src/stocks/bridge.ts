/**
 * Bridge quotes and the bridge-in calls (S14w; docs/specs/pillar2.md B.1.3; D-227 R4-12).
 *
 * In (testnet): the linked Robinhood wallet calls `lockbox.send{value: nativeFee}` to Base with `to = HopComposer<T>`
 * and `composeMsg = (40444, the Tempo account, minLD)`, after `approve(lockbox)` only when the allowance is short. The
 * user pays leg 1 in ETH; the composer's float pays the Base → Tempo leg.
 * Out: the Tempo account calls `adapter.send` to the Base composer with `composeMsg = (40451, the Robinhood wallet,
 * minLD)`; the fee is LZD, paid in pathUSD 1:1 (quoted live 2026-10-12: 0.219679 for 1 bTSLA).
 * Every read returns a Reading; a contract with no fragment answers "not deployed", never zero.
 */
import { encodeFunctionData, erc20Abi, type Address, type Hex, type PublicClient } from "viem";
import { diagnosis, err, LZ_EID, removeDust, toShared, type BridgeDirection, type BridgeTicker, type Reading } from "@cwf/core";
import { iTIP20Abi } from "@cwf/clients/abis/ITIP20";
import { transitOFTAbi } from "@cwf/clients/abis/TransitOFT";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import { withReading } from "../runtime/reading";
import { stockLockboxAbi } from "@cwf/clients/abis/StockLockbox";
import type { BridgeClients } from "./clients";
import { inSendParam, outSendParam, RH_DECIMALS, type SendParam } from "./params";
import { bridgeTopology, type TickerContracts } from "./topology";

export { inSendParam, outSendParam, RH_DECIMALS, type SendParam };

export interface SideCall {
  to: Address;
  data: Hex;
  value: bigint;
}

const ZERO32 = `0x${"0".repeat(64)}`;
const notDeployed = <T>(what: string): Reading<T> => err(diagnosis("not-deployed", `${what} is not deployed on this network yet`));

/** Which links of a ticker's route are wired (peers set); a missing link blocks the CTA with "<T> not connected yet". */
export interface RouteLinks {
  inReady: boolean;
  outReady: boolean;
  /** The Robinhood lockbox exists (its absence is the owner's test ETH, owner-actions S14c). */
  robinhoodLive: boolean;
  /** The Tempo mirror is paused (an arriving credit would be held, a send-out can't burn). */
  mirrorPaused: boolean;
  /** The adapter's sends are paused (bridge-out reverts; held credits can still go back). */
  sendsPaused: boolean;
}

export async function readRouteLinks(clients: BridgeClients, ticker: BridgeTicker): Promise<Reading<RouteLinks>> {
  return withReading(`bridge:links:${clients.network}:${ticker}`, async () => {
    const t = bridgeTopology(clients.network).tickers[ticker];
    const peer = async (c: PublicClient | null, address: Address | null, eid: number, abi: typeof tIP20MintBurnAdapterAbi | typeof transitOFTAbi | typeof stockLockboxAbi) => {
      if (!c || !address) return false;
      const p = (await c.readContract({ address, abi, functionName: "peers", args: [eid] } as never)) as Hex;
      return p !== ZERO32;
    };
    const [adapterToBase, baseToTempo, baseToRh, lockboxToBase, mirrorPaused, sendsPaused] = await Promise.all([
      peer(clients.tempo, t.adapter, LZ_EID.baseSepolia, tIP20MintBurnAdapterAbi),
      peer(clients.base, t.transit, LZ_EID.moderato, transitOFTAbi),
      peer(clients.base, t.transit, LZ_EID.robinhoodTestnet, transitOFTAbi),
      peer(clients.robinhood, t.lockbox, LZ_EID.baseSepolia, stockLockboxAbi),
      t.mirror ? clients.tempo.readContract({ address: t.mirror, abi: iTIP20Abi, functionName: "paused" }) : Promise.resolve(false),
      t.adapter ? clients.tempo.readContract({ address: t.adapter, abi: tIP20MintBurnAdapterAbi, functionName: "sendsPaused" }) : Promise.resolve(false),
    ]);
    const robinhoodLive = t.lockbox !== null;
    return { inReady: robinhoodLive && lockboxToBase && baseToTempo && adapterToBase, outReady: robinhoodLive && adapterToBase && baseToRh, robinhoodLive, mirrorPaused, sendsPaused };
  });
}

export interface BridgeQuote {
  direction: BridgeDirection;
  ticker: BridgeTicker;
  /** What leaves, after dust (6 dp). */
  sentSD: bigint;
  /** What arrives (6 dp); the OFT takes no fee, so it equals `sentSD` unless the contract says otherwise. */
  receivedSD: bigint;
  /** The source-chain LayerZero fee: wei of ETH (in) or LZD base units = pathUSD (out). */
  nativeFee: bigint;
  sendParam: SendParam;
}

/** Bridge in: quote `amountLD` (18 dp, dust dropped) from the Robinhood lockbox, delivered to `tempoTo`. */
export async function quoteBridgeIn(clients: BridgeClients, ticker: BridgeTicker, amountLD: bigint, tempoTo: Address): Promise<Reading<BridgeQuote>> {
  const t = bridgeTopology(clients.network).tickers[ticker];
  if (!t.lockbox || !t.hopComposer) return notDeployed(`The ${ticker} lockbox`);
  return withReading(`bridge:quote-in:${ticker}:${amountLD}:${tempoTo}`, async () => {
    const sp = inSendParam(t, toShared(removeDust(amountLD, RH_DECIMALS), RH_DECIMALS), tempoTo);
    const [oft, fee] = await Promise.all([
      clients.robinhood.readContract({ address: t.lockbox!, abi: transitOFTAbi, functionName: "quoteOFT", args: [sp] }),
      clients.robinhood.readContract({ address: t.lockbox!, abi: transitOFTAbi, functionName: "quoteSend", args: [sp, false] }),
    ]);
    return { direction: "in", ticker, sentSD: toShared(oft[2].amountSentLD, RH_DECIMALS), receivedSD: toShared(oft[2].amountReceivedLD, RH_DECIMALS), nativeFee: fee.nativeFee, sendParam: sp } satisfies BridgeQuote;
  });
}

/** Bridge out: quote `amountSD` of the mirror from the Tempo adapter, delivered to `rhTo` on Robinhood Chain. */
export async function quoteBridgeOut(clients: BridgeClients, ticker: BridgeTicker, amountSD: bigint, rhTo: Address): Promise<Reading<BridgeQuote>> {
  const t = bridgeTopology(clients.network).tickers[ticker];
  if (!t.adapter || !t.hopComposer) return notDeployed(`The ${ticker} adapter`);
  return withReading(`bridge:quote-out:${ticker}:${amountSD}:${rhTo}`, async () => {
    const sp = outSendParam(t, amountSD, rhTo);
    const [oft, fee] = await Promise.all([
      clients.tempo.readContract({ address: t.adapter!, abi: tIP20MintBurnAdapterAbi, functionName: "quoteOFT", args: [sp] }),
      clients.tempo.readContract({ address: t.adapter!, abi: tIP20MintBurnAdapterAbi, functionName: "quoteSend", args: [sp, false] }),
    ]);
    return { direction: "out", ticker, sentSD: oft[2].amountSentLD, receivedSD: oft[2].amountReceivedLD, nativeFee: fee.nativeFee, sendParam: sp } satisfies BridgeQuote;
  });
}

/**
 * The linked Robinhood wallet's calls for a bridge-in quote: `approve(lockbox, amount)` only when the allowance is
 * short (never unlimited), then `lockbox.send{value: nativeFee}` refunding any excess to the sender.
 */
export function bridgeInCalls(ticker: BridgeTicker, network: "testnet" | "mainnet", quote: BridgeQuote, from: Address, allowance: bigint): SideCall[] {
  const t = bridgeTopology(network).tickers[ticker];
  if (!t.lockbox || !t.rhStock) throw new Error(`the ${ticker} lockbox is not deployed`);
  const amountLD = quote.sendParam.amountLD;
  const calls: SideCall[] = [];
  if (allowance < amountLD) calls.push({ to: t.rhStock, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [t.lockbox, amountLD] }), value: 0n });
  const data = encodeFunctionData({ abi: transitOFTAbi, functionName: "send", args: [quote.sendParam, { nativeFee: quote.nativeFee, lzTokenFee: 0n }, from] });
  calls.push({ to: t.lockbox, data, value: quote.nativeFee });
  return calls;
}
