/**
 * The plain cash-out lane (L-35, D-067), ported in shape from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:
 * packages/markets/src/submitter/cash-out.ts onto the Tempo engine: sell a held side back into the book with a SELL IOC
 * before lock, proceeds withdrawn to the wallet in the same call (`withdrawProceeds`). The confirmed exit's
 * `minProceedsBase` is the floor — a fresh exit below it is a requote, never sent. A Window that stopped trading has no
 * exit: it pays at settlement. Sponsored by the relay's engine policy (a sell is `placeOrder`), expiring nonce.
 */
import type { Account, Chain, Transport, WalletClient } from "viem";
import { diagnosis, formatCadence, SIDE_TO_OUTCOME, type Address, type BookedSell, type CashOutOutcome, type CashOutRequest, type Diagnosis, type ExitQuote, type IntentJournal, type PhaseListener } from "@cwf/core";
import { diagnoseWrite as diagnose, isAmbiguousSend } from "./diagnose-write";
import { engineVenue, readBook, readPositions, TAKER_MIN_REST_SEC, type WindowFacts } from "../engine/lens";
import { cashOutCall, newClientId } from "../engine/calls";
import { decodeEngineEvents, ownExecution } from "../engine/decode";
import { exitFromBook } from "../engine/quote";
import { randomU64 } from "../random";
import { sendBatch, type PendingKeyAuthorization } from "../tx/send";
import { nonceFields, nonceKindOf, validBeforeOf, type NoncePlan } from "../tx/nonce";
import { EXIT_LOCKED } from "../provider/engine-reads";
import { ExitRequoteError, OrderRefusedError } from "./errors";
import { takerExpirySec } from "./expiry";
import { statusGate } from "./status-gate";

export interface CashOutContext {
  journal: IntentJournal;
  client: WalletClient<Transport, Chain, Account>;
  wallet: Address;
  canSponsor: boolean;
  nowSec: () => number;
  nowMs: () => number;
  nonce?: NoncePlan;
  /** The wallet key's pending authorization, published with the next send (D-047). */
  pendingKeyAuthorization?: PendingKeyAuthorization;
}

const refused = (d: Diagnosis): CashOutOutcome => ({ status: "refused", diagnosis: d });
const PRICE_MOVED = "ImmediateOrCancelNoFill";

async function gate(req: CashOutRequest): Promise<WindowFacts> {
  try {
    return await statusGate(req.market.marketId);
  } catch (error) {
    if (error instanceof OrderRefusedError && error.diagnosis.kind === "market-not-trading") throw new OrderRefusedError(diagnosis("market-not-trading", `${EXIT_LOCKED} (${error.diagnosis.technical})`));
    throw error;
  }
}

/** The fresh exit for up to `want` lots of the held side; null book → refused, not requoted. */
async function freshExit(w: WindowFacts, req: CashOutRequest, heldLots: bigint, nowMs: number): Promise<ExitQuote> {
  const want = req.contractsRaw / w.series.lotBase < heldLots ? req.contractsRaw / w.series.lotBase : heldLots;
  const exit = exitFromBook(await readBook(w.marketId, TAKER_MIN_REST_SEC), w.series, req.side, want, nowMs);
  if (!exit) throw new OrderRefusedError(diagnosis("no-liquidity", "No exit liquidity right now"));
  return exit;
}

export function bookSell(result: { filledLots: bigint; cashReceived: bigint; fills: number }, req: Pick<CashOutRequest, "side" | "market">, lotBase: bigint, txHash: `0x${string}`): BookedSell | null {
  if (result.filledLots === 0n) return null;
  return {
    marketId: req.market.marketId, side: req.side, contractsRaw: result.filledLots * lotBase, proceedsBase: result.cashReceived,
    avgPriceBps: Number((result.cashReceived * 10n) / result.filledLots), txHash, fillCount: result.fills,
  };
}

export async function submitCashOut(ctx: CashOutContext, req: CashOutRequest, onPhase?: PhaseListener): Promise<CashOutOutcome> {
  let w: WindowFacts | null = null;
  let held = 0n;
  try {
    w = await gate(req);
    const [position] = await readPositions(ctx.wallet, [w.marketId]);
    held = position ? (SIDE_TO_OUTCOME[req.side] === 0 ? position.yesFree : position.noFree) : 0n;
    if (held === 0n) throw new OrderRefusedError(diagnosis("contract-revert", `nothing held on the ${req.side} side to cash out`, { errorName: "InsufficientOutcome" }));
    const exit = await freshExit(w, req, held, ctx.nowMs());
    if (exit.minProceedsBase < req.displayedExit.minProceedsBase) throw new ExitRequoteError(exit);
    const nowSec = ctx.nowSec();
    const expireTsSec = takerExpirySec(nowSec, { lockAtSec: w.snapshot.lockAtSec, intervalSec: w.market.intervalSec });
    const venue = await engineVenue();
    const clientId = newClientId(randomU64);
    const lots = exit.contractsRaw / w.series.lotBase;
    const call = cashOutCall(venue.engine, { marketId: w.marketId, side: req.side, ownLimitTicks: exit.limitPriceTicks, lots, expireTsSec, clientId });
    const plan: NoncePlan = ctx.nonce ?? { kind: "expiring" };
    const record = await ctx.journal.record({
      kind: "order", wallet: ctx.wallet, chainId: ctx.client.chain.id, marketId: w.marketId, sponsored: ctx.canSponsor,
      summary: `Cash out ${exit.contractsRaw} ${req.side === "up" ? "Up" : "Down"} on ${req.market.asset} (${formatCadence(req.market.intervalSec)} Window)`,
      validBeforeSec: validBeforeOf(nonceFields(plan, nowSec)), nonceKind: nonceKindOf(plan),
    });
    onPhase?.("submitted");
    try {
      const { receipt, hash } = await sendBatch(ctx.client, { calls: [call], sponsored: ctx.canSponsor, nonce: plan, nowSec, keyAuthorization: ctx.pendingKeyAuthorization?.current ?? undefined });
      if (ctx.pendingKeyAuthorization) ctx.pendingKeyAuthorization.current = null;
      await ctx.journal.markSent(record.id, hash);
      if (receipt.status !== "success") {
        await ctx.journal.markFailed(record.id, "reverted on chain");
        onPhase?.("reverted", { txHash: hash });
        return { status: "reverted", diagnosis: diagnosis("contract-revert", "the sell reverted", { txHash: hash }), txHash: hash };
      }
      const executed = ownExecution(decodeEngineEvents(venue.engine, receipt.logs), ctx.wallet, w.marketId, clientId);
      const booked = executed ? bookSell(executed.result, req, w.series.lotBase, hash) : null;
      await ctx.journal.markConfirmed(record.id);
      onPhase?.("confirmed", { txHash: hash });
      return booked ? { status: "confirmed", booked } : { status: "nothingFilled", txHash: hash };
    } catch (error) {
      const diag = diagnose(error);
      if (isAmbiguousSend(error)) {
        await ctx.journal.markUnknown(record.id);
        onPhase?.("unknown");
        return { status: "unknown", diagnosis: diagnosis("send-unknown", diag.technical) };
      }
      await ctx.journal.markFailed(record.id, diag.technical);
      throw error;
    }
  } catch (error) {
    onPhase?.("composing");
    if (error instanceof ExitRequoteError) return { status: "requote", exit: error.exit };
    if (error instanceof OrderRefusedError) return refused(error.diagnosis);
    const diag = diagnose(error);
    if (w && held > 0n && diag.errorName === PRICE_MOVED) {
      // The bids moved before the sell landed: re-read the exit so the user sees what it pays now.
      try {
        return { status: "requote", exit: await freshExit(w, req, held, ctx.nowMs()) };
      } catch (again) {
        if (again instanceof OrderRefusedError) return refused(again.diagnosis);
      }
    }
    return refused(diag);
  }
}
