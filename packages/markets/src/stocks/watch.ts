/**
 * The bridge watchers' chain I/O (server-only, `@cwf/markets/stocks-ops`; ops `bridge-watch` and `stock-sync`; S14 14o;
 * D-227 R4-12). Reads the receipts LayerZero Scan can't interpret for us (a deferral inside a delivered credit, a stored compose), the hop
 * floats, and sends the two things ops may pay for: re-running a stored compose once its composer can pay, and the
 * permissionless Robinhood corporate-action push. Every send takes a role key the caller resolved; nothing here reads
 * env or holds a key.
 */
import { createWalletClient, decodeEventLog, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addressToBytes32, LZ_EID, type BridgeTicker, type Network } from "@cwf/core";
import { LAYERZERO } from "@cwf/clients";
import { stockSyncReceiverAbi } from "@cwf/clients/abis/StockSyncReceiver";
import { transitOFTAbi } from "@cwf/clients/abis/TransitOFT";
import { baseSepolia, robinhoodTestnet } from "../chains";
import { endpointComposeAbi, scaledUiAbi, stockSyncSenderAbi } from "./abis";
export { receiptStatus, robinhoodDeferral, tempoDeferral, type Deferral } from "./receipts";
import type { BridgeClients } from "./clients";
import { bridgeTopology } from "./topology";

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
      const e = decodeEventLog({ abi: endpointComposeAbi, data: l.data, topics: l.topics });
      if (e.eventName !== "ComposeSent") continue;
      const c = { from: e.args.from, to: e.args.to, guid: e.args.guid, index: e.args.index, message: e.args.message };
      const hash = await base.readContract({ address: endpoint, abi: endpointComposeAbi, functionName: "composeQueue", args: [c.from, c.to, c.guid, c.index] });
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

const sideChain = (stop: "robinhood" | "base") => (stop === "robinhood" ? robinhoodTestnet : baseSepolia);

/** Re-runs a stored compose on Base with a role key (testnet only); the composer pays the onward fee itself. */
export async function retryCompose(input: { privateKey: Hex; rpcUrl?: string | undefined; compose: StoredCompose }): Promise<Hex> {
  const wallet = createWalletClient({ account: privateKeyToAccount(input.privateKey), chain: sideChain("base"), transport: http(input.rpcUrl) });
  const c = input.compose;
  return wallet.writeContract({ address: LAYERZERO[84532].endpoint as Address, abi: endpointComposeAbi, functionName: "lzCompose", args: [c.from, c.to, c.guid, c.index, c.message, "0x"] });
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
      clients.robinhood.readContract({ address: t.rhStock, abi: scaledUiAbi, functionName: "uiMultiplier" }),
      clients.robinhood.readContract({ address: t.rhStock, abi: scaledUiAbi, functionName: "newUIMultiplier" }),
      clients.robinhood.readContract({ address: t.rhStock, abi: scaledUiAbi, functionName: "effectiveAt" }),
      clients.tempo.readContract({ address: topo.receiver, abi: stockSyncReceiverAbi, functionName: "syncOf", args: [t.mirror] }),
    ]);
    const stale = sync.syncedAt <= 1n || nowSec - Number(sync.syncedAt) > maxAgeSec;
    if (stale || sync.current !== current || sync.pending !== pending || sync.effectiveAt !== at) stocks.push(t.rhStock);
  }
  if (stocks.length === 0) return null;
  const fee = await clients.robinhood.readContract({ address: topo.sender, abi: stockSyncSenderAbi, functionName: "quoteSync", args: [stocks, LZ_EID.baseSepolia] });
  return { stocks, feeWei: fee.nativeFee };
}

/** Sends a planned push from the stock-sync key on Robinhood Chain; returns the source transaction. */
export async function sendStockSync(input: { network: Network; privateKey: Hex; rpcUrl?: string | undefined; plan: SyncPlan }): Promise<Hex> {
  const topo = bridgeTopology(input.network);
  if (!topo.sender) throw new Error("StockSyncSender is not deployed on Robinhood Chain");
  const wallet = createWalletClient({ account: privateKeyToAccount(input.privateKey), chain: sideChain("robinhood"), transport: http(input.rpcUrl) });
  return wallet.writeContract({ address: topo.sender, abi: stockSyncSenderAbi, functionName: "sync", args: [input.plan.stocks, LZ_EID.baseSepolia], value: input.plan.feeWei });
}
