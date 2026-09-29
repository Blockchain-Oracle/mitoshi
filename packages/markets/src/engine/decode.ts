/**
 * Receipt decoding for the user's engine writes (replaces Masayume 68f7a09:packages/markets/src/submitter/steps/
 * book-fills.ts, which read the SDK's fill list): what was bought or sold is what the engine's own `OrderExecuted`
 * (`PlaceResult`) says for this taker — never the requested size (FR-9). `Redeemed` says whether a payout was paid or
 * held as credit for a receive policy (`heldAsCredit`), and `CreditWithdrawn` what a claim moved.
 */
import { decodeEventLog, type Address, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import type { MarketId } from "@cwf/core";

export interface ReceiptLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
}

export interface PlaceResultView {
  filledLots: bigint;
  cashSpent: bigint;
  cashReceived: bigint;
  creditUsed: bigint;
  transferredIn: bigint;
  withdrawn: bigint;
  refunded: bigint;
  restedLots: bigint;
  cancelledLots: bigint;
  restedOrderId: bigint;
  fills: number;
  stopReason: number;
}

export interface OrderExecutedView {
  marketId: MarketId;
  taker: Address;
  kind: number;
  orderType: number;
  limitTicks: number;
  lots: bigint;
  clientId: bigint;
  result: PlaceResultView;
}

export interface RedeemedView {
  marketId: MarketId;
  holder: Address;
  by: Address;
  yesLots: bigint;
  noLots: bigint;
  payout: bigint;
  credit: bigint;
  total: bigint;
  isPartial: boolean;
  heldAsCredit: boolean;
}

export interface CreditWithdrawnView {
  marketId: MarketId;
  owner: Address;
  amount: bigint;
}

export interface EngineReceiptEvents {
  executed: OrderExecutedView[];
  redeemed: RedeemedView[];
  withdrawn: CreditWithdrawnView[];
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The engine's events in a receipt, emitted by `engine` only (a forged log from another contract is ignored). */
export function decodeEngineEvents(engine: Address, logs: readonly ReceiptLog[]): EngineReceiptEvents {
  const out: EngineReceiptEvents = { executed: [], redeemed: [], withdrawn: [] };
  for (const log of logs) {
    if (!eq(log.address, engine)) continue;
    let ev;
    try {
      ev = decodeEventLog({ abi: eventsEngineAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    } catch {
      continue;
    }
    const a = ev.args as Record<string, unknown>;
    if (ev.eventName === "OrderExecuted") {
      const r = a.result as Record<string, bigint | number>;
      out.executed.push({
        marketId: (a.marketId as string).toLowerCase() as MarketId, taker: a.taker as Address, kind: Number(a.kind), orderType: Number(a.orderType),
        limitTicks: Number(a.limitTicks), lots: BigInt(a.lots as bigint), clientId: BigInt(a.clientId as bigint),
        result: {
          filledLots: BigInt(r.filledLots!), cashSpent: BigInt(r.cashSpent!), cashReceived: BigInt(r.cashReceived!), creditUsed: BigInt(r.creditUsed!),
          transferredIn: BigInt(r.transferredIn!), withdrawn: BigInt(r.withdrawn!), refunded: BigInt(r.refunded!), restedLots: BigInt(r.restedLots!),
          cancelledLots: BigInt(r.cancelledLots!), restedOrderId: BigInt(r.restedOrderId!), fills: Number(r.fills), stopReason: Number(r.stopReason),
        },
      });
    } else if (ev.eventName === "Redeemed") {
      out.redeemed.push({
        marketId: (a.marketId as string).toLowerCase() as MarketId, holder: a.holder as Address, by: a.by as Address, yesLots: a.yesLots as bigint, noLots: a.noLots as bigint,
        payout: a.payout as bigint, credit: a.credit as bigint, total: a.total as bigint, isPartial: a.isPartial as boolean, heldAsCredit: a.heldAsCredit as boolean,
      });
    } else if (ev.eventName === "CreditWithdrawn") {
      out.withdrawn.push({ marketId: (a.marketId as string).toLowerCase() as MarketId, owner: a.owner as Address, amount: a.amount as bigint });
    }
  }
  return out;
}

/** The one `OrderExecuted` this wallet's order produced on `marketId` (matched by taker and client id). */
export function ownExecution(events: EngineReceiptEvents, wallet: Address, marketId: MarketId, clientId: bigint): OrderExecutedView | null {
  return events.executed.find((e) => eq(e.taker, wallet) && eq(e.marketId, marketId) && e.clientId === clientId) ?? null;
}
