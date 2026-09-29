/**
 * AD-3's order lane on the Tempo engine (Masayume 68f7a09:packages/markets/src/submitter/order-lane.ts, rebuilt): on-chain
 * status gate → Daily-Stop gate → fresh quote against the confirmed cap → headroom expiry → funding (engine credit
 * first, then the wallet) → journal → ONE atomic send `[pathUSD.approve(engine, exact), engine.placeOrder(IOC)]`
 * (sponsored by the relay's engine policy, expiring nonce) → book from the engine's own `OrderExecuted` → reconcile the
 * Stop reservation. Takers are `ORDER_TYPE.ioc` and never rest a remainder; a pre-open call on a Listed Window is a
 * PostOnly at the confirmed limit. An IOC the book moved away from ("price moved", `ImmediateOrCancelNoFill`) is
 * re-quoted: a dearer book comes back as a requote, never a silent resend. A timeout is "unknown", never re-sent.
 */
import { erc20Abi, type Account, type Chain, type Transport, type WalletClient } from "viem";
import { admissibilityBlocker, belowMinStake, diagnosis, formatCadence, ONCHAIN_STATUS, type Address, type AttributionHook, type BookedOrder, type Diagnosis, type IntentJournal, type OrderOutcome, type OrderRequest, type PhaseListener, type Quote, type StopGate } from "@cwf/core";
import { diagnoseWrite as diagnose, isAmbiguousSend } from "./diagnose-write";
import { engineVenue, readBook, readPositions, type WindowFacts } from "../engine/lens";
import { newClientId, ORDER_TYPE, walletOrderCalls } from "../engine/calls";
import { decodeEngineEvents, ownExecution } from "../engine/decode";
import { ownLimitTicksOf, quoteFromBook } from "../engine/quote";
import { randomU64 } from "../random";
import { getPublicClient } from "../runtime/read-runtime";
import { sendBatch, type PendingKeyAuthorization } from "../tx/send";
import { nonceFields, nonceKindOf, validBeforeOf, type NoncePlan } from "../tx/nonce";
import { OrderRefusedError, RequoteError } from "./errors";
import { restingExpirySec, takerExpirySec } from "./expiry";
import { statusGate } from "./status-gate";

export interface OrderLaneContext {
  journal: IntentJournal;
  client: WalletClient<Transport, Chain, Account>;
  wallet: Address;
  canSponsor: boolean;
  nowSec: () => number;
  nowMs: () => number;
  stopGate: StopGate;
  attribution: AttributionHook;
  nonce?: NoncePlan;
  /** The wallet key's pending authorization, published with the next send (D-047). */
  pendingKeyAuthorization?: PendingKeyAuthorization;
}

/** The Daily-Stop seam (AD-9): allow-all until the Stop service exists. */
export const allowAllStopGate: StopGate = { checkAndReserve: async () => ({ ok: true, reservationId: "allow-all" }), reconcile: async () => {} };
export const noAttribution: AttributionHook = () => ({});

const refused = (d: Diagnosis): OrderOutcome => ({ status: "refused", diagnosis: d });
const PRICE_MOVED = "ImmediateOrCancelNoFill";

function summarize({ side, market, stakeBase }: OrderRequest): string {
  return `${side === "up" ? "Up" : "Down"} on ${market.asset} (${formatCadence(market.intervalSec)} Window), ${stakeBase} base staked`;
}

/** Fresh quote off the chain book; refuses the unfillable and the inadmissible, surfaces a dearer book as a requote. */
export async function freshQuote(w: WindowFacts, req: OrderRequest, nowMs: number): Promise<Quote> {
  if (belowMinStake(req.stakeBase, w.market.decimals)) throw new OrderRefusedError(diagnosis("below-min-quantity", `stake ${req.stakeBase} is below the minimum`));
  const quote = quoteFromBook(await readBook(w.marketId, w.series.minRestSec), w.series, req.side, req.stakeBase, nowMs);
  if (!quote) throw new OrderRefusedError(diagnosis("no-liquidity", `nothing fillable for ${req.stakeBase} on the ${req.side} side`));
  const band = admissibilityBlocker(quote.avgPriceBps);
  if (band) throw new OrderRefusedError(diagnosis("outside-band", `${band}: the book quotes ${quote.avgPriceBps} bps`));
  if (quote.maxCostBase > req.displayedQuote.maxCostBase) throw new RequoteError(quote);
  return quote;
}

/** What the engine's `OrderExecuted` booked for this taker; null when nothing crossed (a PostOnly that rested). */
export function bookExecution(result: { filledLots: bigint; cashSpent: bigint; fills: number }, req: Pick<OrderRequest, "side" | "market">, lotBase: bigint, txHash: `0x${string}`): BookedOrder | null {
  if (result.filledLots === 0n) return null;
  return {
    marketId: req.market.marketId, side: req.side, contractsRaw: result.filledLots * lotBase, costBase: result.cashSpent,
    avgPriceBps: Number((result.cashSpent * 10n + result.filledLots - 1n) / result.filledLots), txHash, fillCount: result.fills,
  };
}

async function assertFunded(wallet: Address, pullBase: bigint): Promise<void> {
  if (pullBase === 0n) return;
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const balance = await client.readContract({ address: venue.collateral, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  if (balance < pullBase) throw new OrderRefusedError(diagnosis("insufficient-collateral", `wallet holds ${balance} but the order escrows ${pullBase} after engine credit`));
}

async function preSendOutcome(error: unknown, w: WindowFacts | null, req: OrderRequest, nowMs: () => number): Promise<OrderOutcome> {
  if (error instanceof RequoteError) return { status: "requote", quote: error.quote };
  if (error instanceof OrderRefusedError) return refused(error.diagnosis);
  const diag = diagnose(error);
  // The book moved between the quote and the fill estimate: re-quote once so the user sees the new price.
  if (w && diag.errorName === PRICE_MOVED) {
    try {
      await freshQuote(w, req, nowMs());
      return refused(diagnosis("requote", "the book moved; the confirmed cap still covers the fresh price, tap again", { errorName: PRICE_MOVED }));
    } catch (again) {
      return preSendOutcome(again, null, req, nowMs);
    }
  }
  return refused(diag);
}

export async function submitOrder(ctx: OrderLaneContext, req: OrderRequest, onPhase?: PhaseListener): Promise<OrderOutcome> {
  if (req.route && req.route.kind !== "wallet") {
    return refused(diagnosis("not-deployed", "Trading Balance orders ride EventVault.place/placeFor — S7's off-chain half, sequenced after S4"));
  }
  let w: WindowFacts | null = null;
  let reservationId: string | null = null;
  try {
    w = await statusGate(req.market.marketId, true);
    const preOpen = w.status === ONCHAIN_STATUS.Listed;
    const stop = await ctx.stopGate.checkAndReserve(ctx.wallet, req.displayedQuote.maxCostBase);
    if (!stop.ok) return refused(diagnosis("daily-stop", stop.reason));
    reservationId = stop.reservationId;

    const quote = preOpen ? req.displayedQuote : await freshQuote(w, req, ctx.nowMs());
    const nowSec = ctx.nowSec();
    const window = { lockAtSec: w.snapshot.lockAtSec, intervalSec: w.market.intervalSec };
    const expireTsSec = preOpen ? restingExpirySec(nowSec, window) : takerExpirySec(nowSec, window);
    const venue = await engineVenue();
    const [position] = await readPositions(ctx.wallet, [w.marketId]);
    const creditBase = position?.credit ?? 0n;
    const lots = quote.contractsRaw / w.series.lotBase;
    const pull = quote.maxCostBase > creditBase ? quote.maxCostBase - creditBase : 0n;
    await assertFunded(ctx.wallet, pull);

    const clientId = newClientId(randomU64);
    const calls = walletOrderCalls({
      engine: venue.engine, collateral: venue.collateral, marketId: w.marketId, side: req.side, ownLimitTicks: ownLimitTicksOf(quote, w.series), lots,
      maxCostBase: quote.maxCostBase, creditBase, expireTsSec, clientId, preOpen,
    });
    const plan: NoncePlan = ctx.nonce ?? { kind: "expiring" };
    const sponsored = ctx.canSponsor;
    const record = await ctx.journal.record({
      kind: "order", wallet: ctx.wallet, summary: summarize(req), chainId: ctx.client.chain.id, marketId: req.market.marketId,
      validBeforeSec: validBeforeOf(nonceFields(plan, nowSec)), nonceKind: nonceKindOf(plan), sponsored,
    });
    onPhase?.("submitted");
    try {
      const { receipt, hash } = await sendBatch(ctx.client, { calls, sponsored, nonce: plan, nowSec, keyAuthorization: ctx.pendingKeyAuthorization?.current ?? undefined });
      if (ctx.pendingKeyAuthorization) ctx.pendingKeyAuthorization.current = null;
      await ctx.journal.markSent(record.id, hash);
      if (receipt.status !== "success") {
        await ctx.journal.markFailed(record.id, "reverted on chain");
        onPhase?.("reverted", { txHash: hash });
        return { status: "reverted", diagnosis: diagnosis("contract-revert", "the order reverted", { txHash: hash }), txHash: hash };
      }
      const executed = ownExecution(decodeEngineEvents(venue.engine, receipt.logs), ctx.wallet, w.marketId, clientId);
      const booked = executed ? bookExecution(executed.result, req, w.series.lotBase, hash) : null;
      await ctx.journal.markConfirmed(record.id);
      await ctx.stopGate.reconcile(reservationId, booked?.costBase ?? (preOpen ? quote.maxCostBase : 0n));
      reservationId = null;
      onPhase?.("confirmed", { txHash: hash });
      return booked ? { status: "confirmed", booked } : { status: "nothingFilled", txHash: hash };
    } catch (error) {
      const diag = diagnose(error);
      if (isAmbiguousSend(error)) {
        await ctx.journal.markUnknown(record.id);
        reservationId = null; // an unknown send may still land: its reservation stays until reconciled (AD-9)
        onPhase?.("unknown");
        return { status: "unknown", diagnosis: diagnosis("send-unknown", diag.technical) };
      }
      await ctx.journal.markFailed(record.id, diag.technical);
      throw error;
    }
  } catch (error) {
    onPhase?.("composing");
    return preSendOutcome(error, w, req, ctx.nowMs);
  } finally {
    if (reservationId) await ctx.stopGate.reconcile(reservationId, 0n);
  }
}

/** For the invariant and the reader: a taker is always IOC. */
export const TAKER_ORDER_TYPE = ORDER_TYPE.ioc; // orderType: 2 (IOC)
