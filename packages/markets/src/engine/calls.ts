/**
 * The user's engine calls (plan C.2.3 table; engine A.2): pure builders returning `Call`s for `tx/send.ts`. Prices are
 * always YES ticks 1..999 (engine `Grid`): a NO order's limit travels as `1000 − ownTicks`. Takers are IOC and never
 * rest (canon #7); a pre-open call is PostOnly (Listed admits PostOnly only). The wallet order's approval is exact —
 * never max (relay `approve-max`), and it is what the D-047 access key's daily limit counts.
 * Replaces Masayume 68f7a09:packages/markets/src/submitter/steps/send.ts (SDK `trader.placeOrder`).
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import type { MarketId, Side } from "@cwf/core";
import { approveCall, type Call } from "../tx/batch";
import { KIND, ORDER_TYPE } from "../ops/calls";

export { KIND, ORDER_TYPE };

export const PAIR_TICKS = 1000;
/** Engine per-call caps (A.2 `PlaceArgs.maxFills/maxEvictions`, Series caps 16/16). */
export const MAX_FILLS = 16;
export const MAX_EVICTIONS = 16;
/** `cancelOrders` takes ≤ 16 handles (engine `MAX_CANCEL_HANDLES`). */
export const MAX_CANCEL_IDS = 16;

const engineCall = (engine: Address, functionName: string, args: readonly unknown[]): Call => ({
  to: engine,
  data: encodeFunctionData({ abi: eventsEngineAbi, functionName: functionName as never, args: args as never }),
});

export type TradeAction = "buy" | "sell";

/** The engine `kind` for buying or selling a side: Up = YES, Down = NO. */
export function kindOf(side: Side, action: TradeAction): number {
  if (side === "up") return action === "buy" ? KIND.buyYes : KIND.sellYes;
  return action === "buy" ? KIND.buyNo : KIND.sellNo;
}

/** YES-terms ticks for a side's own-terms price (the engine takes YES prices for every kind). */
export function yesTicksOf(side: Side, ownTicks: number): number {
  if (!Number.isInteger(ownTicks) || ownTicks < 1 || ownTicks > 999) throw new Error(`price ${ownTicks} is outside 1..999 ticks`);
  return side === "up" ? ownTicks : PAIR_TICKS - ownTicks;
}

export interface PlaceInput {
  marketId: MarketId | Hex;
  side: Side;
  action: TradeAction;
  orderType: number;
  /** Protective limit in the side's OWN terms (what the user pays or receives per lot, in ticks). */
  ownLimitTicks: number;
  lots: bigint;
  expireTsSec: number;
  clientId: bigint;
  /** Use engine credit on this Window before pulling from the wallet. */
  useCredit: boolean;
  /** Send this Window's credit (sell proceeds included) to the wallet in the same call. */
  withdrawProceeds: boolean;
}

export function placeOrderCall(engine: Address, p: PlaceInput): Call {
  if (p.lots <= 0n) throw new Error("an order needs lots > 0");
  return engineCall(engine, "placeOrder", [
    {
      marketId: p.marketId, kind: kindOf(p.side, p.action), orderType: p.orderType, selfMatch: 0, priceTicks: yesTicksOf(p.side, p.ownLimitTicks),
      lots: p.lots, expireTs: p.expireTsSec, maxFills: MAX_FILLS, maxEvictions: MAX_EVICTIONS, useCredit: p.useCredit, withdrawProceeds: p.withdrawProceeds, clientId: p.clientId,
    },
  ]);
}

export interface WalletOrderInput {
  engine: Address;
  collateral: Address;
  marketId: MarketId | Hex;
  side: Side;
  ownLimitTicks: number;
  lots: bigint;
  /** `lots × ownLimitTicks × cashUnit`: the most the order can cost. */
  maxCostBase: bigint;
  /** Engine credit already on this Window that the order may use first (head-fresh `creditOf`). */
  creditBase: bigint;
  expireTsSec: number;
  clientId: bigint;
  /** PostOnly for a pre-open call on a Listed Window; IOC otherwise. */
  preOpen?: boolean;
}

/**
 * `[pathUSD.approve(engine, maxCost − credit), engine.placeOrder(IOC | PostOnly)]` — the wallet order (C.2.3 row 1).
 * The approval is exact and omitted when credit covers the whole escrow.
 */
export function walletOrderCalls(w: WalletOrderInput): Call[] {
  const pull = w.maxCostBase > w.creditBase ? w.maxCostBase - w.creditBase : 0n;
  const place = placeOrderCall(w.engine, {
    marketId: w.marketId, side: w.side, action: "buy", orderType: w.preOpen ? ORDER_TYPE.postOnly : ORDER_TYPE.ioc, ownLimitTicks: w.ownLimitTicks,
    lots: w.lots, expireTsSec: w.expireTsSec, clientId: w.clientId, useCredit: w.creditBase > 0n, withdrawProceeds: false,
  });
  return pull > 0n ? [approveCall(w.collateral, w.engine, pull), place] : [place];
}

/** Cash-out (L-35): SELL IOC of a held side at the exit's protective limit, proceeds withdrawn in the same call. */
export function cashOutCall(engine: Address, p: { marketId: MarketId | Hex; side: Side; ownLimitTicks: number; lots: bigint; expireTsSec: number; clientId: bigint }): Call {
  return placeOrderCall(engine, { ...p, action: "sell", orderType: ORDER_TYPE.ioc, useCredit: false, withdrawProceeds: true });
}

export const redeemCall = (engine: Address, marketId: MarketId | Hex): Call => engineCall(engine, "redeem", [marketId]);
export const redeemPartialCall = (engine: Address, marketId: MarketId | Hex, outcome: 0 | 1, lots: bigint): Call => engineCall(engine, "redeemPartial", [marketId, outcome, lots]);
export const withdrawCreditCall = (engine: Address, marketId: MarketId | Hex, amountBase: bigint): Call => engineCall(engine, "withdrawCredit", [marketId, amountBase]);
export const cancelAllCall = (engine: Address, marketId: MarketId | Hex, max: number): Call => engineCall(engine, "cancelAll", [marketId, max, true]);

export function cancelOrdersCall(engine: Address, marketId: MarketId | Hex, orderIds: readonly bigint[]): Call {
  if (orderIds.length === 0 || orderIds.length > MAX_CANCEL_IDS) throw new Error(`cancelOrders takes 1–${MAX_CANCEL_IDS} ids`);
  return engineCall(engine, "cancelOrders", [marketId, orderIds, true]);
}

/** A random 64-bit client id (`OrderExecuted.clientId`), how a journal record finds its own order on chain. */
export function newClientId(random: () => bigint): bigint {
  return random() & 0xffff_ffff_ffff_ffffn;
}
