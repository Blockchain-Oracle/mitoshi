/**
 * Engine call builders for the venue actors (A.2 native ABI). Each returns a `Call` for `tx/send.ts`; nothing here
 * signs. Replaces Agari 03b30ab:packages/markets/src/ops/{roller,prints,settle,maker}.ts instruction builders.
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import type { Call } from "../tx/batch";

const engineCall = (engine: Address, functionName: string, args: readonly unknown[]): Call => ({
  to: engine,
  data: encodeFunctionData({ abi: eventsEngineAbi, functionName: functionName as never, args: args as never }),
});

/** `BoundaryKind` byte: Intraday 0, SessionOpen 1, SessionClose 2. */
export const BOUNDARY_KIND = { Intraday: 0, SessionOpen: 1, SessionClose: 2 } as const;
export const WHICH = { open: 0, close: 1, checkOpen: 2, checkClose: 3 } as const;
export type PrintSlotName = keyof typeof WHICH;
export const KIND = { buyYes: 0, sellYes: 1, buyNo: 2, sellNo: 3 } as const;
export const ORDER_TYPE = { normal: 0, fok: 1, ioc: 2, postOnly: 3 } as const;

export interface OpenWindowArgs {
  seriesId: Hex;
  index: bigint;
  tradingStartSec: number;
  lockAtSec: number;
  expirySec: number;
  openKind: number;
  closeKind: number;
}

// The tuple keys are the frozen ABI's field names (engine-abi-v1), quoted: they carry seconds without our suffix.
export const openWindowCall = (engine: Address, a: OpenWindowArgs): Call =>
  engineCall(engine, "openWindow", [{ seriesId: a.seriesId, index: a.index, "tradingStart": a.tradingStartSec, "lockAt": a.lockAtSec, "expiry": a.expirySec, openKind: a.openKind, closeKind: a.closeKind }]);

export const recordPrintCall = (engine: Address, market: Hex, which: number, proof: Hex): Call => engineCall(engine, "recordPrint", [market, which, proof]);
export const copyOpenFromPrevCall = (engine: Address, market: Hex, prev: Hex): Call => engineCall(engine, "copyOpenFromPrev", [market, prev]);
export const settleCall = (engine: Address, market: Hex): Call => engineCall(engine, "settle", [market]);
export const voidExpiredCall = (engine: Address, market: Hex): Call => engineCall(engine, "voidExpired", [market]);
/** `max` 1..32 (A.2). */
export const sweepExpiredCall = (engine: Address, market: Hex, max: number): Call => engineCall(engine, "sweepExpired", [market, max]);
export const redeemForCall = (engine: Address, market: Hex, holder: Address): Call => engineCall(engine, "redeemFor", [market, holder]);
export const redeemCall = (engine: Address, market: Hex): Call => engineCall(engine, "redeem", [market]);
export const cancelAllCall = (engine: Address, market: Hex, max: number, withdraw: boolean): Call => engineCall(engine, "cancelAll", [market, max, withdraw]);
export const mergeSetCall = (engine: Address, market: Hex, lots: bigint, withdraw: boolean): Call => engineCall(engine, "mergeSet", [market, lots, withdraw]);
export const withdrawCreditCall = (engine: Address, market: Hex, amount: bigint): Call => engineCall(engine, "withdrawCredit", [market, amount]);

export interface PlaceArgs {
  market: Hex;
  kind: number;
  orderType: number;
  priceTicks: number;
  lots: bigint;
  expireTsSec: number;
  clientId: bigint;
  useCredit?: boolean;
  withdrawProceeds?: boolean;
}

export const placeOrderCall = (engine: Address, a: PlaceArgs): Call =>
  engineCall(engine, "placeOrder", [
    {
      marketId: a.market, kind: a.kind, orderType: a.orderType, selfMatch: 0, priceTicks: a.priceTicks, lots: a.lots, expireTs: a.expireTsSec,
      maxFills: 16, maxEvictions: 16, useCredit: a.useCredit ?? true, withdrawProceeds: a.withdrawProceeds ?? false, clientId: a.clientId,
    },
  ]);
