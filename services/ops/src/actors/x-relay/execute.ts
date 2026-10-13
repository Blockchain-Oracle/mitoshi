// Ported from Masayume 68f7a09:services/ops/src/actors/x-relay/{execute,receipt-outcome}.ts and rebuilt on Tempo the way
// the strategy runner was (S9.5, `strategy-runner/execute.ts`): the order quoted and pre-checked against the grant
// before anything is reserved, a `placeFor` IOC sent self-paid from the executor key with an expiring nonce, and the
// hash stored once signed — so a restart settles the mention from its receipt and never resends it (S11, D-227).
import type { Address, Hex } from "viem";
import { describeRefusal, formatBaseUnits, formatCadence, isBalanceOnlyXGrant, parseInstruction, USD_DECIMALS, X_REFUSAL_DETAILS, type XReceipt, type XRefusalCode } from "@cwf/core";
import type { XStore } from "@cwf/db";
import { OpsSendError, pickXWindow, preflight, readBooks, readExecutorGrant, readHoldings, runnerFillOf, sendOps, xOrder, type OpsClient, type XVenue } from "@cwf/markets/ops";
import type { Mention } from "./transport";

export interface ExecuteContext {
  /** The executor's client: its wallet signs `placeFor`; read-only in a dry run without a key. */
  client: OpsClient;
  xv: XVenue;
  store: Pick<XStore, "linkByAuthor" | "saveReceipt" | "recordTx">;
  /** The address an EXECUTOR grant must name. */
  executor: Address | null;
  dryRun: boolean;
  log: (why: string) => void;
  nowMs?: () => number;
}

/** The vault's refusals by name, as the public reason (Masayume's `receipt-outcome.ts` table, EventVault's errors). */
const VAULT_ERRORS: Record<string, XRefusalCode> = {
  OverStakeCap: "grant-update-required", OverDailyCap: "grant-update-required", OverPriceCap: "price-limit", OverPositionCap: "position-limit",
  Insufficient: "insufficient-funds", GrantExpired: "grant-expired", GrantIsRevoked: "grant-missing", NoSuchGrant: "grant-missing",
  NotGrantActor: "grant-mismatch", OutsideGrantMarket: "permission-denied", MarketNotTrading: "window-entry-closed",
};

function receiptFor(mention: Mention, over: Partial<XReceipt>): XReceipt {
  return { mentionId: mention.id, authorId: mention.authorId, handle: mention.handle, wallet: null, grantId: null, marketId: null, side: null, stakeBase: null, status: "refused", reason: null, txHash: null, instruction: mention.text, atMs: mention.createdAtMs, ...over };
}

const refused = (mention: Mention, code: XRefusalCode, over: Partial<XReceipt> = {}): XReceipt => receiptFor(mention, { ...over, status: "refused", refusalCode: code, reason: over.reason ?? X_REFUSAL_DETAILS[code] });
const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

/**
 * One mention → one receipt. The author's live link names the account; the text parses to exactly one call or one
 * refusal; the account's EXECUTOR grant must be live, name this executor and hold the stake; the Window is the one the
 * call names. Then, live, one `placeFor` through that grant — nothing here can move the account's money anywhere but
 * into a position it owns (the vault's rule), and nothing pays the executor.
 */
export async function executeMention(ctx: ExecuteContext, mention: Mention): Promise<XReceipt> {
  const nowMs = (ctx.nowMs ?? Date.now)();
  const nowSec = Math.floor(nowMs / 1000);
  const parsed = parseInstruction(mention.text, { decimals: USD_DECIMALS });
  const link = await ctx.store.linkByAuthor(mention.authorId);
  // An unlinked author's call keeps what it asked for (a reply can then say "link first"); a mention that isn't a call
  // keeps only why, and gets no reply (`reply.ts`): the bot answers calls, not every mention.
  if (!link) return refused(mention, "account-not-linked", parsed.ok ? { side: parsed.instruction.side, stakeBase: parsed.instruction.stakeBase.toString(), asset: parsed.instruction.asset, intervalSec: parsed.instruction.intervalSec } : { parseRefusal: parsed.reason });
  const owner = link.account as Address;

  if (!parsed.ok) return refused(mention, "instruction-invalid", { wallet: owner, parseRefusal: parsed.reason, reason: describeRefusal(parsed.reason, parsed.token) });
  const call = parsed.instruction;
  const base: Partial<XReceipt> = { wallet: owner, side: call.side, stakeBase: call.stakeBase.toString(), asset: call.asset, intervalSec: call.intervalSec };

  if (!ctx.executor) return refused(mention, "execution-unavailable", base);
  const grant = await readExecutorGrant(ctx.client, ctx.xv, owner).catch(() => undefined);
  if (grant === undefined) return refused(mention, "balance-unavailable", base);
  if (!grant || grant.revoked) return refused(mention, "grant-missing", base);
  const withGrant = { ...base, grantId: grant.grantId.toString() };
  if (grant.actor.toLowerCase() !== ctx.executor.toLowerCase()) return refused(mention, "grant-mismatch", withGrant);
  if (grant.expiresAtSec <= nowSec) return refused(mention, "grant-expired", withGrant);
  if (!isBalanceOnlyXGrant(grant)) return refused(mention, "grant-update-required", withGrant);
  if (call.stakeBase > grant.budgetBase) return refused(mention, "insufficient-funds", withGrant);

  const pick = await pickXWindow(ctx.client, ctx.xv, call.asset, call.intervalSec, nowSec).catch(() => null);
  if (!pick) return refused(mention, "market-data-unavailable", withGrant);
  if (!pick.ok) return refused(mention, pick.code, { ...withGrant, ...(pick.lane ? { lane: pick.lane } : {}), ...(pick.entryClosesAtSec ? { entryClosesAtSec: pick.entryClosesAtSec } : {}), ...(pick.nextWindowAtSec ? { nextWindowAtSec: pick.nextWindowAtSec } : {}) });
  const w = pick.window;
  const withMarket = { ...withGrant, marketId: w.marketId, expirySec: w.expirySec, lane: pick.lane };

  const [books, holdings] = await Promise.all([readBooks(ctx.client, ctx.xv, [w.marketId]), readHoldings(ctx.client, ctx.xv, [{ owner, marketId: w.marketId }])]).catch(() => [null, null] as const);
  if (!books || !holdings) return refused(mention, "quote-unavailable", withMarket);
  const order = xOrder(ctx.xv, {
    grant, window: w, side: call.side, stakeBase: call.stakeBase, book: books.get(w.marketId.toLowerCase()) ?? null,
    held: holdings.get(`${owner.toLowerCase()}:${w.marketId.toLowerCase()}`) ?? { up: 0n, down: 0n }, nowSec, nowMs,
  });
  if (!order.ok) return refused(mention, order.code, withMarket);
  const what = `${call.asset} ${call.side.toUpperCase()} ${usd(call.stakeBase)} on the ${formatCadence(call.intervalSec)} Window #${w.index} (${pick.lane}) at ≤${order.quote.oddsCents}¢`;

  if (ctx.dryRun) {
    ctx.log(`mention ${mention.id}: dry run — would place ${what} through grant #${grant.grantId}`);
    return refused(mention, "execution-paused", { ...withMarket, dryRun: true, reason: `Dry run: would place ${what}.` });
  }

  try {
    await preflight(ctx.client, order.call);
  } catch (error) {
    const name = error instanceof OpsSendError ? error.errorName : null;
    return refused(mention, (name && VAULT_ERRORS[name]) || "unconfirmed", withMarket);
  }
  // The checkpoint: the executor and the block the send starts from, durable before anything is signed.
  const fromBlock = await ctx.client.public.getBlockNumber();
  await ctx.store.saveReceipt(receiptFor(mention, { ...withMarket, status: "submitted", executionActor: ctx.executor.toLowerCase(), recoveryFromBlock: fromBlock.toString(), journalState: "recorded", intentRecordedAtMs: nowMs }));
  try {
    const sent = await sendOps(ctx.client, [order.call], { simulate: false, nowSec, onSigned: (hash) => void ctx.store.recordTx(mention.id, hash).catch(() => undefined) });
    const fill = runnerFillOf(sent.receipt.logs, ctx.xv, owner, w.marketId as Hex, grant.grantId);
    ctx.log(`mention ${mention.id}: ${fill && fill.tokenDeltaRaw > 0n ? "filled" : "nothing filled"} — ${what} — ${sent.hash}`);
    if (!fill || fill.tokenDeltaRaw === 0n) return receiptFor(mention, { ...withMarket, status: "nothing-filled", txHash: sent.hash, reason: "Nothing was booked.", journalState: "confirmed", executionActor: ctx.executor.toLowerCase() });
    return receiptFor(mention, {
      ...withMarket, status: "filled", txHash: sent.hash, journalState: "confirmed", executionActor: ctx.executor.toLowerCase(),
      bookedCostBase: fill.cashDeltaBase.toString(), bookedContractsRaw: fill.tokenDeltaRaw.toString(), avgPriceBps: Number((fill.cashDeltaBase * 10_000n) / fill.tokenDeltaRaw),
    });
  } catch (error) {
    // A revert is final; anything else may still land until the expiring nonce lapses — recovery decides it.
    if (error instanceof OpsSendError && error.txHash) return receiptFor(mention, { ...withMarket, status: "reverted", txHash: error.txHash, reason: "The vault rejected the trade.", journalState: "failed", executionActor: ctx.executor.toLowerCase() });
    ctx.log(`mention ${mention.id}: confirmation unknown (${error instanceof Error ? error.message.slice(0, 160) : String(error)}); not resending`);
    return receiptFor(mention, { ...withMarket, status: "unknown", reason: "Needs checking before another instruction.", journalState: "unknown", executionActor: ctx.executor.toLowerCase() });
  }
}
