// Ported from Masayume 68f7a09:packages/markets/src/vault/order.ts — rebuilt on the Tempo order lane: the status gate,
// fresh quote, headroom expiry and journal are the wallet lane's own (`submitter/order-lane.ts`), the send is one
// `tx/send.ts` batch (sponsored for a grant's actor by the relay's vault policy, never re-sent), and the fill is booked
// from the vault's own `Executed` event. No SDK trader, no gas top-up (Tempo has no gas token).
/**
 * AD-3's third dimension: the same intent as a wallet order, through the EventVault — from the owner's Trading Balance
 * (`place`, owner-signed, not sponsored: Q-021) or from a grant's budget by the grant's actor (`placeFor`, the
 * session key's tap, sponsored). A delegated tap is pre-checked against the grant exactly as the contract will check it
 * (`simulateCaps`, golden-tested against the forge suite), so a cap refusal is named before anything is signed — and
 * it is checked at the worst the fill can charge (the escrow at the protective limit), so the pre-check never passes a
 * tap the contract would refuse.
 */
import { parseEventLogs, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { diagnosis, formatBaseUnits, formatCadence, oneUnit, ownTermsPriceRaw, simulateCaps, type BookedOrder, type CapRefusal, type Diagnosis, type MarketId, type OrderOutcome, type OrderRequest, type PhaseListener, type Side, type VaultGrant } from "@cwf/core";
import { isAmbiguousSend } from "../submitter/diagnose-write";
import { OrderRefusedError, RequoteError } from "../submitter/errors";
import { freshQuote, requoteAfterRevert, type OrderLaneContext } from "../submitter/order-lane";
import { statusGate } from "../submitter/status-gate";
import { takerExpirySec } from "../submitter/expiry";
import { sendBatch } from "../tx/send";
import { nonceFields, nonceKindOf, validBeforeOf, type NoncePlan } from "../tx/nonce";
import type { WindowFacts } from "../engine/lens";
import { placeCall, placeForCall } from "./calls";
import { diagnoseVault } from "./errors";
import { readVaultGrant, readVaultHoldings, readVaultSnapshot, vaultDeploymentOf } from "./read";

type VaultRoute = { kind: "vault" } | { kind: "vault-grant"; grantId: bigint };

const refused = (d: Diagnosis): OrderOutcome => ({ status: "refused", diagnosis: d });
const NS_PER_SEC = 1_000_000_000n;
const PRICE_MOVED = "ImmediateOrCancelNoFill";

/** The contract's error name for each refusal, so the surface and the chain speak one vocabulary. */
export const CAP_ERROR: Record<CapRefusal["kind"], string> = {
  revoked: "GrantIsRevoked", expired: "GrantExpired", market: "OutsideGrantMarket", price: "OverPriceCap", escrow: "Insufficient",
  stake: "OverStakeCap", daily: "OverDailyCap", positions: "OverPositionCap",
};

/** The refusal in plain words (the journal's and the diagnosis's `technical`); the surface has its own copy. */
export function capRefusalText(refusal: CapRefusal, decimals: number): string {
  const money = (base: bigint) => `$${formatBaseUnits(base, decimals, { minDp: 2, maxDp: 2 })}`;
  switch (refusal.kind) {
    case "revoked":
      return "the grant has been revoked";
    case "expired":
      return `the grant expired at ${new Date(refusal.expiresAtSec * 1000).toISOString()}`;
    case "market":
      return `the grant is scoped to Window ${refusal.scope}`;
    case "price":
      return `the side is priced ${refusal.sidePriceRaw} against a cap of ${refusal.capRaw}`;
    case "escrow":
      return `the order escrows ${money(refusal.worstBase)} but the grant's budget is ${money(refusal.budgetBase)}`;
    case "stake":
      return `the order could spend ${money(refusal.spendBase)} against a per-tap cap of ${money(refusal.capBase)}`;
    case "daily":
      return `today's spend would reach ${money(refusal.wouldBeBase)} against a daily cap of ${money(refusal.capBase)} (resets 00:00 UTC)`;
    case "positions":
      return `this would be open Window ${refusal.wouldBe} of ${refusal.cap}`;
  }
}

/** A delegated buy against its grant, the contract's checks in the contract's order; throws the named refusal. */
export function assertGrantCovers(input: { grant: VaultGrant; actor: Address; marketId: MarketId; side: Side; limitPriceRaw: bigint; contractsRaw: bigint; worstCostBase: bigint; heldRaw: bigint; nowSec: number; decimals: number }): void {
  const { grant, decimals } = input;
  if (grant.actor.toLowerCase() !== input.actor.toLowerCase()) {
    throw new OrderRefusedError(diagnosis("grant-refused", `${input.actor} is not the actor of grant #${grant.grantId}`, { errorName: "NotGrantActor" }));
  }
  const verdict = simulateCaps({
    grant, nowSec: input.nowSec, marketId: input.marketId, sidePriceRaw: ownTermsPriceRaw(input.limitPriceRaw, input.side, decimals),
    quantityRaw: input.contractsRaw, spendBase: input.worstCostBase, one: oneUnit(decimals), opensNewPosition: input.heldRaw === 0n,
  });
  if (!verdict.ok) throw new OrderRefusedError(diagnosis("grant-refused", capRefusalText(verdict.refusal, decimals), { errorName: CAP_ERROR[verdict.refusal.kind] }));
}

/** What the vault booked is what its `Executed` event says — collateral moved and tokens gained (FR-9). */
export function bookVaultFill(logs: Parameters<typeof parseEventLogs>[0]["logs"], vault: Address, owner: Address, marketId: MarketId, grantId: bigint, side: Side, txHash: Hex): BookedOrder | null {
  const fills = parseEventLogs({ abi: eventVaultAbi, eventName: "Executed", logs }).filter(
    (l) => l.address.toLowerCase() === vault.toLowerCase() && l.args.owner.toLowerCase() === owner.toLowerCase() && l.args.marketId.toLowerCase() === marketId && l.args.grantId === grantId && l.args.isBuy,
  );
  const fill = fills[0];
  if (!fill || fill.args.tokenDelta === 0n) return null;
  const { cashDelta, tokenDelta } = fill.args;
  // Price per whole contract in bps, rounded up (as the wallet lane does): cash × 10⁴ / contracts.
  const avgPriceBps = Number((cashDelta * 10_000n + tokenDelta - 1n) / tokenDelta);
  return { marketId, side, contractsRaw: tokenDelta, costBase: cashDelta, avgPriceBps, txHash, fillCount: 1 };
}

function summarize(req: OrderRequest, route: VaultRoute): string {
  const via = route.kind === "vault-grant" ? `tap-trading grant #${route.grantId}` : "the Trading Balance";
  return `${req.side === "up" ? "Up" : "Down"} on ${req.market.asset} (${formatCadence(req.market.intervalSec)} Window), up to $${formatBaseUnits(req.displayedQuote.maxCostBase, req.market.decimals, { minDp: 2, maxDp: 2 })} via ${via}`;
}

async function preSendOutcome(error: unknown, w: WindowFacts | null, req: OrderRequest, nowMs: () => number): Promise<OrderOutcome> {
  if (error instanceof RequoteError) return { status: "requote", quote: error.quote };
  if (error instanceof OrderRefusedError) return refused(error.diagnosis);
  const diag = diagnoseVault(error);
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

/**
 * The vault route of the order lane. `ctx.wallet` is the signer: the owner for `vault`, the grant's actor (the
 * session key) for `vault-grant`; the owner of a delegated tap is the grant's, read on chain.
 */
export async function submitVaultOrder(ctx: OrderLaneContext, req: OrderRequest, onPhase?: PhaseListener): Promise<OrderOutcome> {
  const route = req.route as VaultRoute;
  const deployment = vaultDeploymentOf(ctx.client.chain.id);
  if (!deployment) return refused(diagnosis("not-deployed", `EventVault is not deployed on chain ${ctx.client.chain.id}`));
  const vault = deployment.eventVault;
  const marketId = req.market.marketId;
  let w: WindowFacts | null = null;
  let reservationId: string | null = null;
  try {
    // The grant (or the balance) and the Window read together: one round trip before the quote (D-142).
    const account = route.kind === "vault-grant" ? readVaultGrant(route.grantId) : readVaultSnapshot(ctx.wallet);
    account.catch(() => undefined);
    w = await statusGate(marketId);
    const stop = await ctx.stopGate.checkAndReserve(ctx.wallet, req.displayedQuote.maxCostBase);
    if (!stop.ok) return refused(diagnosis("daily-stop", stop.reason));
    reservationId = stop.reservationId;
    const [quote, held] = await Promise.all([freshQuote(w, req, ctx.nowMs()), account]);
    const nowSec = ctx.nowSec();
    const expireNs = BigInt(takerExpirySec(nowSec, { lockAtSec: w.snapshot.lockAtSec, intervalSec: w.market.intervalSec })) * NS_PER_SEC;
    const outcomeIdx: 0 | 1 = req.side === "up" ? 0 : 1;
    let owner: Address = ctx.wallet;
    let grantId = 0n;
    if (route.kind === "vault-grant") {
      const grant = held as VaultGrant | null;
      if (!grant) throw new OrderRefusedError(diagnosis("not-deployed", "EventVault is not deployed on this chain"));
      owner = grant.owner;
      grantId = grant.grantId;
      const holdings = await readVaultHoldings(owner, marketId);
      assertGrantCovers({
        grant, actor: ctx.wallet, marketId, side: req.side, limitPriceRaw: quote.limitPriceRaw, contractsRaw: quote.contractsRaw, worstCostBase: quote.maxCostBase,
        heldRaw: req.side === "up" ? holdings.upRaw : holdings.downRaw, nowSec, decimals: req.market.decimals,
      });
    } else {
      const available = (held as Awaited<ReturnType<typeof readVaultSnapshot>>)?.account.availableBase ?? 0n;
      if (available < quote.maxCostBase) {
        throw new OrderRefusedError(diagnosis("insufficient-collateral", `the Trading Balance holds ${available} but the order escrows ${quote.maxCostBase}`, { errorName: "Insufficient" }));
      }
    }
    const args = { marketId, outcomeIdx, isBuy: true, priceRaw: quote.limitPriceRaw, quantityRaw: quote.contractsRaw, expireNs };
    const calls = [route.kind === "vault-grant" ? placeForCall(vault, { grantId, ...args }) : placeCall(vault, args)];
    const plan: NoncePlan = ctx.nonce ?? { kind: "expiring" };
    // The owner's own `place` is not sponsored (Q-021 default); a grant's tap is, when the signer can ask.
    const sponsored = route.kind === "vault-grant" && ctx.canSponsor;
    const record = await ctx.journal.record({
      kind: "order", wallet: ctx.wallet, summary: summarize(req, route), chainId: ctx.client.chain.id, marketId,
      validBeforeSec: validBeforeOf(nonceFields(plan, nowSec)), nonceKind: nonceKindOf(plan), sponsored,
    });
    onPhase?.("submitted");
    try {
      // Signed and final: the surface may show the call as confirmed-pending while the chain includes it (D43, D-150).
      const onSigned = (hash: `0x${string}` | null) => onPhase?.("confirming", hash ? { txHash: hash } : undefined);
      const { receipt, hash } = await sendBatch(ctx.client, { calls, sponsored, nonce: plan, nowSec }, { onSigned });
      await ctx.journal.markSent(record.id, hash);
      if (receipt.status !== "success") {
        await ctx.journal.markFailed(record.id, "reverted on chain");
        onPhase?.("reverted", { txHash: hash });
        const moved = await requoteAfterRevert(w, req, ctx.nowMs());
        if (moved) return moved;
        return { status: "reverted", diagnosis: diagnosis("contract-revert", "the vault order reverted", { txHash: hash }), txHash: hash };
      }
      const booked = bookVaultFill(receipt.logs as never, vault, owner, marketId, grantId, req.side, hash);
      await ctx.journal.markConfirmed(record.id);
      await ctx.stopGate.reconcile(reservationId, booked?.costBase ?? 0n);
      reservationId = null;
      onPhase?.("confirmed", { txHash: hash });
      return booked ? { status: "confirmed", booked } : { status: "nothingFilled", txHash: hash };
    } catch (error) {
      if (isAmbiguousSend(error)) {
        await ctx.journal.markUnknown(record.id);
        reservationId = null; // an unknown send may still land: its reservation stays until reconciled (AD-9)
        onPhase?.("unknown");
        return { status: "unknown", diagnosis: diagnosis("send-unknown", diagnoseVault(error).technical) };
      }
      await ctx.journal.markFailed(record.id, diagnoseVault(error).technical);
      throw error;
    }
  } catch (error) {
    onPhase?.("composing");
    return preSendOutcome(error, w, req, ctx.nowMs);
  } finally {
    if (reservationId) await ctx.stopGate.reconcile(reservationId, 0n);
  }
}
