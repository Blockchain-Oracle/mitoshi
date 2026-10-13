/**
 * Following one transfer on the chains (S14 14o/14w; D-227 R4-12): the source receipt and the bridge send inside it,
 * leg 1 from LayerZero Scan by the source hash, the hop's onward leg by the compose transaction it ran on Base, a
 * deferral inside the final delivery and, after one, whether the holder still has it held. `@cwf/core`
 * `advanceTransfer` turns this into legs and a phase. Shared by ops `bridge-watch` and the browser's tracker, so a
 * transfer is followed live even before ops records it.
 *
 * A recorded hash is only followed as this stock's transfer when its receipt carries the route's source contract's
 * `OFTSent` (the lockbox in, the adapter out) — from the recorded sender, for the recorded amount, when those are
 * given — so a stray or invented hash ends as "nothing moved" instead of being followed forever.
 */
import type { Address, Hex } from "viem";
import { routeOf, toShared, type BridgeDirection, type BridgeTicker, type LegObservation, type ScanMessage, type TransferObservation } from "@cwf/core";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import { stockLockboxAbi } from "@cwf/clients/abis/StockLockbox";
import type { BridgeClients } from "./clients";
import { scanByTx, type ScanFetch } from "./lzscan";
import { RH_DECIMALS } from "./params";
import { robinhoodDeferral, sourceSend, tempoDeferral, type Deferral } from "./receipts";
import { bridgeTopology } from "./topology";

export interface TransferRef {
  direction: BridgeDirection;
  ticker: BridgeTicker;
  srcTx: Hex;
  /** The recorded amount (6 dp); checked against the source's `OFTSent` when given. */
  amountSD?: bigint | undefined;
  /** The recorded sender; checked against the source's `OFTSent` when given. */
  sender?: string | undefined;
}

const delivered = (m: ScanMessage | null) => m !== null && (m.status === "DELIVERED" || m.dstStatus === "SUCCEEDED") && m.dstTx !== null;

export async function observeTransfer(clients: BridgeClients, t: TransferRef, fetcher?: ScanFetch): Promise<TransferObservation> {
  const network = clients.network;
  const route = routeOf(t.direction, network);
  const c = bridgeTopology(network).tickers[t.ticker];
  const source = t.direction === "in" ? c.lockbox : c.adapter;
  if (!source) return { src: "unrelated", legs: [], bounced: false };
  const send = await sourceSend(t.direction === "in" ? clients.robinhood : clients.tempo, t.srcTx, source);
  if (send?.status === "success" && !matches(send.sent, t)) return { src: "unrelated", legs: [], bounced: false };
  const src = send?.status ?? null;
  if (src === "reverted") return { src, legs: [], bounced: false };
  const first = (await scanByTx(network, t.srcTx, fetcher)).find((m) => m.srcEid === route.legs[0]!.srcEid) ?? null;
  const legs: LegObservation[] = [{ msg: first, deferral: null }];
  let bounced = false;
  if (route.legs.length > 1 && first?.composeTx) {
    const onward = (await scanByTx(network, first.composeTx, fetcher)).find((m) => m.srcEid === route.legs[1]!.srcEid) ?? null;
    bounced = onward !== null && onward.dstEid !== route.legs[1]!.dstEid;
    legs.push({ msg: onward, deferral: null });
  }
  const last = legs[route.legs.length - 1];
  let heldNow: bigint | null = null;
  if (last && delivered(last.msg)) {
    const held = await deferralOf(clients, t, last.msg!.dstTx!);
    last.deferral = held?.reason ?? null;
    if (held) heldNow = await stillHeld(clients, t, held.to).catch(() => null);
  }
  return { src, legs, bounced, heldNow };
}

/** The source's `OFTSent` is this transfer: present, and from the recorded sender for the recorded amount when given. */
function matches(sent: { from: Address; amountSentLD: bigint } | null, t: TransferRef): boolean {
  if (!sent) return false;
  if (t.sender && sent.from.toLowerCase() !== t.sender.toLowerCase()) return false;
  const sentSD = t.direction === "in" ? toShared(sent.amountSentLD, RH_DECIMALS) : sent.amountSentLD;
  return t.amountSD === undefined || sentSD === t.amountSD;
}

async function deferralOf(clients: BridgeClients, t: TransferRef, tx: Hex): Promise<Deferral | null> {
  const c = bridgeTopology(clients.network).tickers[t.ticker];
  if (t.direction === "in" && c.adapter) return tempoDeferral(clients.tempo, tx, c.adapter);
  if (t.direction === "out" && c.lockbox) return robinhoodDeferral(clients.robinhood, tx, c.lockbox);
  return null;
}

/** What the holder of a held credit still has held now: the adapter's `deferredOf` (in) or the lockbox's `owed` (out). */
async function stillHeld(clients: BridgeClients, t: TransferRef, holder: Address): Promise<bigint | null> {
  const c = bridgeTopology(clients.network).tickers[t.ticker];
  if (t.direction === "in" && c.adapter) return clients.tempo.readContract({ address: c.adapter, abi: tIP20MintBurnAdapterAbi, functionName: "deferredOf", args: [holder] });
  if (t.direction === "out" && c.lockbox) return clients.robinhood.readContract({ address: c.lockbox, abi: stockLockboxAbi, functionName: "owed", args: [holder] });
  return null;
}
