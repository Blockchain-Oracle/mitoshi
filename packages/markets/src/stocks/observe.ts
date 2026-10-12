/**
 * Following one transfer on the chains (S14 14o/14w; D-227 R4-12): the source receipt, leg 1 from LayerZero Scan by
 * the source hash, the hop's onward leg by the compose transaction it ran on Base, and a deferral inside the final
 * delivery. `@cwf/core` `advanceTransfer` turns this into legs and a phase. Shared by ops `bridge-watch` and the
 * browser's tracker, so a transfer is followed live even before ops records it.
 */
import type { Hex } from "viem";
import { routeOf, type BridgeDirection, type BridgeTicker, type DeferReason, type LegObservation, type ScanMessage, type TransferObservation } from "@cwf/core";
import type { BridgeClients } from "./clients";
import { scanByTx, type ScanFetch } from "./lzscan";
import { receiptStatus, robinhoodDeferral, tempoDeferral } from "./receipts";
import { bridgeTopology } from "./topology";

export interface TransferRef {
  direction: BridgeDirection;
  ticker: BridgeTicker;
  srcTx: Hex;
}

const delivered = (m: ScanMessage | null) => m !== null && (m.status === "DELIVERED" || m.dstStatus === "SUCCEEDED") && m.dstTx !== null;

export async function observeTransfer(clients: BridgeClients, t: TransferRef, fetcher?: ScanFetch): Promise<TransferObservation> {
  const network = clients.network;
  const route = routeOf(t.direction, network);
  const src = await receiptStatus(t.direction === "in" ? clients.robinhood : clients.tempo, t.srcTx);
  const first = (await scanByTx(network, t.srcTx, fetcher)).find((m) => m.srcEid === route.legs[0]!.srcEid) ?? null;
  const legs: LegObservation[] = [{ msg: first, deferral: null }];
  let bounced = false;
  if (route.legs.length > 1 && first?.composeTx) {
    const onward = (await scanByTx(network, first.composeTx, fetcher)).find((m) => m.srcEid === route.legs[1]!.srcEid) ?? null;
    bounced = onward !== null && onward.dstEid !== route.legs[1]!.dstEid;
    legs.push({ msg: onward, deferral: null });
  }
  const last = legs[route.legs.length - 1];
  if (last && delivered(last.msg)) last.deferral = await deferralOf(clients, t, last.msg!.dstTx!);
  return { src, legs, bounced };
}

async function deferralOf(clients: BridgeClients, t: TransferRef, tx: Hex): Promise<DeferReason | null> {
  const c = bridgeTopology(clients.network).tickers[t.ticker];
  if (t.direction === "in" && c.adapter) return (await tempoDeferral(clients.tempo, tx, c.adapter))?.reason ?? null;
  if (t.direction === "out" && c.lockbox) return (await robinhoodDeferral(clients.robinhood, tx, c.lockbox))?.reason ?? null;
  return null;
}
