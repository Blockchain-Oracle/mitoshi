/**
 * The bridge watchers' reads (server-only, `@cwf/markets/stocks-ops`; ops `bridge-watch` and `stock-sync`; S14 14o;
 * D-227 R4-12): a compose a Base delivery stored, the hop floats against one onward fee, and which Robinhood
 * multipliers Tempo hasn't applied. The two sends ops may pay for (re-running a stored compose, the permissionless
 * corporate-action push) live with every other side-chain send in `./bridge-in.ts` (the write boundary) and are
 * re-exported here.
 */
import { decodeEventLog, type Address, type Hex, type PublicClient } from "viem";
import { addressToBytes32, LZ_EID, type BridgeTicker } from "@cwf/core";
import { LAYERZERO } from "@cwf/clients";
import { stockSyncReceiverAbi } from "@cwf/clients/abis/StockSyncReceiver";
import { transitOFTAbi } from "@cwf/clients/abis/TransitOFT";
import { iLayerZeroEndpointV2Abi } from "@cwf/clients/abis/ILayerZeroEndpointV2";
import { scaledUIViewAbi } from "@cwf/clients/abis/ScaledUIView";
import { stockSyncSenderAbi } from "@cwf/clients/abis/StockSyncSender";
import type { BridgeClients } from "./clients";
import { bridgeTopology } from "./topology";

export { receiptStatus, robinhoodDeferral, tempoDeferral, type Deferral } from "./receipts";
export { retryCompose, sendStockSync } from "./bridge-in";

export interface StoredCompose {
  from: Address;
  to: Address;
  guid: Hex;
  index: number;
  message: Hex;
}

/** The compose a Base delivery queued (`ComposeSent` on the endpoint) and whether it still waits to run. */
export async function storedCompose(base: PublicClient, deliveryTx: Hex): Promise<(StoredCompose & { pending: boolean }) | null> {
  const endpoint = LAYERZERO[84532].endpoint as Address;
  const receipt = await base.getTransactionReceipt({ hash: deliveryTx });
  for (const l of receipt.logs.filter((x) => x.address.toLowerCase() === endpoint)) {
    try {
      const e = decodeEventLog({ abi: iLayerZeroEndpointV2Abi, data: l.data, topics: l.topics });
      if (e.eventName !== "ComposeSent") continue;
      const c = { from: e.args.from, to: e.args.to, guid: e.args.guid, index: e.args.index, message: e.args.message };
      const hash = await base.readContract({ address: endpoint, abi: iLayerZeroEndpointV2Abi, functionName: "composeQueue", args: [c.from, c.to, c.guid, c.index] });
      // EndpointV2 marks a run compose with RECEIVED_MESSAGE_HASH (0x…01); empty means none was queued.
      return { ...c, pending: BigInt(hash) > 1n };
    } catch {
      continue;
    }
  }
  return null;
}

export interface HopFloat {
  ticker: BridgeTicker;
  composer: Address;
  balanceWei: bigint;
  /** The onward leg's fee, quoted now (the composer pays it from its balance). */
  onwardFeeWei: bigint;
}

/** Each deployed composer's ETH against what one onward hop costs (bridge-watch alerts under 5 hops). */
export async function readHopFloats(clients: BridgeClients): Promise<HopFloat[]> {
  if (!clients.base) return [];
  const base = clients.base;
  const ts = Object.values(bridgeTopology(clients.network).tickers).filter((t) => t.hopComposer && t.transit);
  return Promise.all(
    ts.map(async (t) => {
      const sp = { dstEid: LZ_EID.moderato, to: addressToBytes32(t.hopComposer!), amountLD: 10n ** 12n, minAmountLD: 0n, extraOptions: "0x" as Hex, composeMsg: "0x" as Hex, oftCmd: "0x" as Hex };
      const [balanceWei, fee] = await Promise.all([base.getBalance({ address: t.hopComposer! }), base.readContract({ address: t.transit!, abi: transitOFTAbi, functionName: "quoteSend", args: [sp, false] })]);
      return { ticker: t.ticker, composer: t.hopComposer!, balanceWei, onwardFeeWei: fee.nativeFee };
    }),
  );
}

export interface SyncPlan {
  stocks: Address[];
  feeWei: bigint;
}

/**
 * Which Robinhood Stock Tokens' multipliers differ from what Tempo's receiver last applied (or were never synced, or
 * not for `maxAgeSec`), and the fee to push them — null when nothing needs a push or the sender isn't deployed.
 */
export async function planStockSync(clients: BridgeClients, maxAgeSec: number, nowSec: number): Promise<SyncPlan | null> {
  const topo = bridgeTopology(clients.network);
  if (!topo.sender || !topo.receiver) return null;
  const stocks: Address[] = [];
  for (const t of Object.values(topo.tickers)) {
    if (!t.rhStock || !t.mirror || !t.lockbox) continue;
    const [current, pending, at, sync] = await Promise.all([
      clients.robinhood.readContract({ address: t.rhStock, abi: scaledUIViewAbi, functionName: "uiMultiplier" }),
      clients.robinhood.readContract({ address: t.rhStock, abi: scaledUIViewAbi, functionName: "newUIMultiplier" }),
      clients.robinhood.readContract({ address: t.rhStock, abi: scaledUIViewAbi, functionName: "effectiveAt" }),
      clients.tempo.readContract({ address: topo.receiver, abi: stockSyncReceiverAbi, functionName: "syncOf", args: [t.mirror] }),
    ]);
    const stale = sync.syncedAt <= 1n || nowSec - Number(sync.syncedAt) > maxAgeSec;
    if (stale || sync.current !== current || sync.pending !== pending || sync.effectiveAt !== at) stocks.push(t.rhStock);
  }
  if (stocks.length === 0) return null;
  const fee = await clients.robinhood.readContract({ address: topo.sender, abi: stockSyncSenderAbi, functionName: "quoteSync", args: [stocks, LZ_EID.baseSepolia] });
  return { stocks, feeWei: fee.nativeFee };
}
