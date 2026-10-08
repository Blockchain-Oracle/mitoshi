/**
 * The Trading Balance's sell lane (S23d, D-197): a position the vault holds for its owner sold back into the book —
 * the same exit as the wallet's cash-out (`exitFromBook`, its `minProceedsBase` the floor, a fresh exit below the shown
 * floor is a requote, never sent), sent through the vault as `place(…, isBuy = false)` by the owner or
 * `placeFor(grantId, …, isBuy = false)` by the grant's actor (the session key's tap, sponsored). The contract takes the
 * held contracts from the owner's position and books the proceeds to the owner's balance (`EventVault._bookSale`).
 */
import { parseEventLogs, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { diagnosis, formatBaseUnits, formatCadence, type BookedSell, type CashOutOutcome, type CashOutRequest, type Diagnosis, type ExitQuote, type MarketId, type PhaseListener, type Side, type VaultGrant } from "@cwf/core";
import { yesTicksOf } from "../engine/calls";
import { readBook, type WindowFacts } from "../engine/lens";
import { exitFromBook } from "../engine/quote";
import { isAmbiguousSend } from "../submitter/diagnose-write";
import { ExitRequoteError, OrderRefusedError } from "../submitter/errors";
import { takerExpirySec } from "../submitter/expiry";
import type { OrderLaneContext } from "../submitter/order-lane";
import { statusGate } from "../submitter/status-gate";
import { sendBatch } from "../tx/send";
import { nonceFields, nonceKindOf, validBeforeOf, type NoncePlan } from "../tx/nonce";
import { placeCall, placeForCall } from "./calls";
import { diagnoseVault } from "./errors";
import { readVaultGrant, readVaultHoldings, vaultDeploymentOf } from "./read";

const NS_PER_SEC = 1_000_000_000n;
const PRICE_MOVED = "ImmediateOrCancelNoFill";
const refused = (d: Diagnosis): CashOutOutcome => ({ status: "refused", diagnosis: d });

/** The sale as the vault's `Executed` event booked it: contracts given up and the cash the fills paid the owner. */
export function bookVaultSale(logs: Parameters<typeof parseEventLogs>[0]["logs"], vault: Address, owner: Address, marketId: MarketId, grantId: bigint, side: Side, txHash: Hex): BookedSell | null {
  const sale = parseEventLogs({ abi: eventVaultAbi, eventName: "Executed", logs }).find(
    (l) => l.address.toLowerCase() === vault.toLowerCase() && l.args.owner.toLowerCase() === owner.toLowerCase() && l.args.marketId.toLowerCase() === marketId && l.args.grantId === grantId && !l.args.isBuy,
  );
  if (!sale || sale.args.tokenDelta === 0n) return null;
  const { cashDelta, tokenDelta } = sale.args;
  return { marketId, side, contractsRaw: tokenDelta, proceedsBase: cashDelta, avgPriceBps: Number((cashDelta * 10_000n) / tokenDelta), txHash, fillCount: 1 };
}

/** The fresh exit for what the vault holds on the side (at most the asked contracts). */
async function freshVaultExit(w: WindowFacts, side: Side, wantRaw: bigint, heldRaw: bigint, nowMs: number): Promise<ExitQuote> {
  const lotBase = w.series.lotBase;
  const want = wantRaw < heldRaw ? wantRaw : heldRaw;
  const exit = exitFromBook(await readBook(w.marketId, w.series.minRestSec), w.series, side, want / lotBase, nowMs);
  if (!exit) throw new OrderRefusedError(diagnosis("no-liquidity", "No exit liquidity right now"));
  return exit;
}

/**
 * Sells a Trading Balance position. `ctx.wallet` is the signer: the owner for `vault`, the grant's actor (the session
 * key) for `vault-grant`; the owner of a delegated sale is the grant's, read on chain.
 */
export async function submitVaultSell(ctx: OrderLaneContext, req: CashOutRequest, onPhase?: PhaseListener): Promise<CashOutOutcome> {
  const route = req.route;
  if (!route || route.kind === "wallet") return refused(diagnosis("contract-revert", "not a Trading Balance sale"));
  const deployment = vaultDeploymentOf(ctx.client.chain.id);
  if (!deployment) return refused(diagnosis("not-deployed", `EventVault is not deployed on chain ${ctx.client.chain.id}`));
  const vault = deployment.eventVault;
  const marketId = req.market.marketId;
  let w: WindowFacts | null = null;
  let owner: Address = ctx.wallet;
  let heldRaw = 0n;
  try {
    // The grant and the Window read together: one round before the book (D-142).
    const grantRead: Promise<VaultGrant | null> = route.kind === "vault-grant" ? readVaultGrant(route.grantId) : Promise.resolve(null);
    grantRead.catch(() => undefined);
    w = await statusGate(marketId);
    const grant = await grantRead;
    const grantId = route.kind === "vault-grant" ? route.grantId : 0n;
    if (route.kind === "vault-grant") {
      if (!grant) throw new OrderRefusedError(diagnosis("grant-refused", `grant #${route.grantId} not found`, { errorName: "NoSuchGrant" }));
      if (grant.actor.toLowerCase() !== ctx.wallet.toLowerCase()) throw new OrderRefusedError(diagnosis("grant-refused", `${ctx.wallet} is not the actor of grant #${grantId}`, { errorName: "NotGrantActor" }));
      owner = grant.owner;
    }
    const holdings = await readVaultHoldings(owner, marketId);
    heldRaw = req.side === "up" ? holdings.upRaw : holdings.downRaw;
    if (heldRaw === 0n) throw new OrderRefusedError(diagnosis("contract-revert", `the Trading Balance holds nothing on the ${req.side} side`, { errorName: "Insufficient" }));
    const exit = await freshVaultExit(w, req.side, req.contractsRaw, heldRaw, ctx.nowMs());
    if (exit.minProceedsBase < req.displayedExit.minProceedsBase) throw new ExitRequoteError(exit);
    const nowSec = ctx.nowSec();
    const expireNs = BigInt(takerExpirySec(nowSec, { lockAtSec: w.snapshot.lockAtSec, intervalSec: w.market.intervalSec })) * NS_PER_SEC;
    // The vault hands the engine YES ticks (`VenueGateway._placeIoc`): an own-terms floor is turned over for Down.
    const priceRaw = BigInt(yesTicksOf(req.side, exit.limitPriceTicks)) * w.series.tickBase;
    const args = { marketId, outcomeIdx: (req.side === "up" ? 0 : 1) as 0 | 1, isBuy: false, priceRaw, quantityRaw: exit.contractsRaw, expireNs };
    const call = route.kind === "vault-grant" ? placeForCall(vault, { grantId, ...args }) : placeCall(vault, args);
    const plan: NoncePlan = ctx.nonce ?? { kind: "expiring" };
    const sponsored = route.kind === "vault-grant" && ctx.canSponsor;
    const record = await ctx.journal.record({
      kind: "order", wallet: ctx.wallet, chainId: ctx.client.chain.id, marketId, sponsored,
      summary: `Sell ${formatBaseUnits(exit.contractsRaw, req.market.decimals, { minDp: 0 })} ${req.side === "up" ? "Up" : "Down"} on ${req.market.asset} (${formatCadence(req.market.intervalSec)} Window) from the Trading Balance, at least $${formatBaseUnits(exit.minProceedsBase, req.market.decimals, { minDp: 2, maxDp: 2 })}`,
      validBeforeSec: validBeforeOf(nonceFields(plan, nowSec)), nonceKind: nonceKindOf(plan),
    });
    onPhase?.("submitted");
    try {
      const onSigned = (hash: `0x${string}` | null) => onPhase?.("confirming", hash ? { txHash: hash } : undefined);
      const { receipt, hash } = await sendBatch(ctx.client, { calls: [call], sponsored, nonce: plan, nowSec }, { onSigned });
      await ctx.journal.markSent(record.id, hash);
      if (receipt.status !== "success") {
        await ctx.journal.markFailed(record.id, "reverted on chain");
        onPhase?.("reverted", { txHash: hash });
        return { status: "reverted", diagnosis: diagnosis("contract-revert", "the vault sale reverted", { txHash: hash }), txHash: hash };
      }
      const booked = bookVaultSale(receipt.logs as never, vault, owner, marketId, grantId, req.side, hash);
      await ctx.journal.markConfirmed(record.id);
      onPhase?.("confirmed", { txHash: hash });
      return booked ? { status: "confirmed", booked } : { status: "nothingFilled", txHash: hash };
    } catch (error) {
      if (isAmbiguousSend(error)) {
        await ctx.journal.markUnknown(record.id);
        onPhase?.("unknown");
        return { status: "unknown", diagnosis: diagnosis("send-unknown", diagnoseVault(error).technical) };
      }
      await ctx.journal.markFailed(record.id, diagnoseVault(error).technical);
      throw error;
    }
  } catch (error) {
    onPhase?.("composing");
    if (error instanceof ExitRequoteError) return { status: "requote", exit: error.exit };
    if (error instanceof OrderRefusedError) return refused(error.diagnosis);
    const diag = diagnoseVault(error);
    if (w && heldRaw > 0n && diag.errorName === PRICE_MOVED) {
      // The bids moved before the sale landed: re-read the exit so the user sees what it pays now.
      try {
        return { status: "requote", exit: await freshVaultExit(w, req.side, req.contractsRaw, heldRaw, ctx.nowMs()) };
      } catch (again) {
        if (again instanceof OrderRefusedError) return refused(again.diagnosis);
      }
    }
    return refused(diag);
  }
}
