// Ported from Masayume 68f7a09:services/ops/src/actors/strategy-runner/{execute,lifecycle}.ts + Agari 03b30ab
// (`sideForSubscriber`, A-1c) — rebuilt on `sendOps` (an expiring nonce, the hash stored once signed), so recovery reads
// a receipt or waits out the nonce's window instead of scanning nonces; settlement stays the settler's (it cranks every
// owner's settled Windows, S7).
import type { Address, Hex } from "viem";
import { formatBaseUnits, sideForSubscriber, type Decision, type SkipKind } from "@cwf/core";
import type { StrategyAttemptStore, StrategyStore } from "@cwf/db";
import { OPS_VALID_FOR_SEC, OpsSendError, preflight, runnerFillOf, runnerOrder, sendOps, type OpsClient, type RunnerVenue, type RunnerWindow, type SubscriberState } from "@cwf/markets/ops";
import type { YesBook } from "@cwf/markets/ops";
import { tallySkips } from "./calls";
import type { Candidate } from "./decide";

export type ExecutionResult =
  | { status: "filled"; txHash: Hex; side: "up" | "down"; cashDeltaBase: bigint; tokenDeltaRaw: bigint }
  | { status: "skipped"; reason: string; code: SkipKind }
  | { status: "refused"; reason: string; code: "refused" }
  | { status: "unknown"; reason: string }
  | { status: "dry-run"; reason: string };

/**
 * One subscriber, one Window, one decision → at most one IOC through the subscriber's grant. The order is quoted,
 * pre-checked against the grant and simulated BEFORE the attempt is reserved, so a book that moved costs nothing and is
 * tried again next cycle; once reserved, the Window is never sent twice for that subscriber.
 */
export async function executeForSubscriber(input: {
  client: OpsClient; rv: RunnerVenue; attempts: StrategyAttemptStore; strategyId: bigint; sub: SubscriberState; window: RunnerWindow; decision: Decision;
  book: YesBook | null; held: { up: bigint; down: bigint }; nowSec: number; nowMs: number; dryRun: boolean;
  /** A theme's call: the member's weight, which scales the per-trade cap (D-231). */
  weightBps?: number;
}): Promise<ExecutionResult> {
  const { client, rv, attempts, strategyId, sub, window: w, decision, nowSec, nowMs } = input;
  if (!decision.side) return { status: "skipped", reason: "no side", code: "other" };
  if (!sub.live || !sub.grant) return { status: "skipped", reason: "grant not live", code: "grant" };
  const side = sideForSubscriber(decision.side, sub.mode);
  const key = { strategyId: strategyId.toString(), marketId: w.marketId, owner: sub.owner };
  const previous = await attempts.get(key);
  if (previous) {
    const reason = `this Window already has ${/^[aeiu]/.test(previous.state) ? "an" : "a"} ${previous.state} attempt; not resending`;
    return previous.state === "unknown" || previous.state === "attempting" ? { status: "unknown", reason } : { status: "skipped", reason, code: "in-window" };
  }
  const order = runnerOrder(rv, { grant: sub.grant, window: w, side, book: input.book, held: input.held, nowSec, nowMs, ...(input.weightBps === undefined ? {} : { weightBps: input.weightBps }) });
  if (!order.ok) return { status: "skipped", reason: order.why, code: order.code };
  const what = `${side.toUpperCase()}${sub.mode === "fade" ? " (fading)" : ""} $${formatBaseUnits(order.stakeBase, w.grid.decimals, { minDp: 2, maxDp: 2 })} @ ≤${order.quote.oddsCents}¢`;
  if (input.dryRun) return { status: "dry-run", reason: `would place ${what}` };
  try {
    await preflight(client, order.call);
  } catch (error) {
    return { status: "skipped", reason: `not now: ${error instanceof OpsSendError ? (error.errorName ?? error.message) : String(error)}`, code: "other" };
  }
  const block = await client.public.getBlockNumber();
  const acquired = await attempts.begin({ ...key, runner: client.address!, grantId: sub.grantId.toString(), side, mode: sub.mode, stakeBase: order.stakeBase.toString(), fromBlock: block.toString(), nonce: 0 });
  if (!acquired) return { status: "skipped", reason: "another attempt already reserved this Window; not resending", code: "in-window" };
  try {
    const sent = await sendOps(client, [order.call], { simulate: false, nowSec, onSigned: (hash) => void attempts.setTx(key, hash).catch(() => undefined) });
    const fill = runnerFillOf(sent.receipt.logs, rv, sub.owner, w.marketId, sub.grantId);
    if (!fill || fill.tokenDeltaRaw === 0n) {
      await attempts.finish(key, "nothing-filled", sent.hash, "the IOC filled nothing");
      return { status: "skipped", reason: `${what}: nothing filled`, code: "book" };
    }
    await attempts.recordFill({ txHash: sent.hash, strategyId: key.strategyId, grantId: sub.grantId.toString(), owner: sub.owner, marketId: w.marketId, side, mode: sub.mode, cashDelta: fill.cashDeltaBase.toString(), tokenDelta: fill.tokenDeltaRaw.toString(), atSec: nowSec, dryRun: false });
    return { status: "filled", txHash: sent.hash, side, cashDeltaBase: fill.cashDeltaBase, tokenDeltaRaw: fill.tokenDeltaRaw };
  } catch (error) {
    const reverted = error instanceof OpsSendError && error.txHash;
    const reason = error instanceof OpsSendError ? error.message : String(error);
    // A revert is final; anything else may still land until the expiring nonce lapses — recovery decides it.
    if (reverted) {
      await attempts.finish(key, "reverted", error.txHash ?? null, reason);
      return { status: "refused", reason, code: "refused" };
    }
    await attempts.finish(key, "unknown", null, `${reason}; not resending`).catch(() => undefined);
    return { status: "unknown", reason };
  }
}

/** One pass's execution of a strategy's calls, over every Window it executed. */
export interface CallsRun {
  filled: number;
  /** Why each copier it could not fill was skipped (one already in its Window included; `tallySkips` drops those). */
  skips: SkipKind[];
  notes: string[];
  /** A send whose confirmation is unknown: the pass stopped there, and no decision row was marked. */
  unknown: string | null;
}

/**
 * Every call × every live copier, then each Window's decision row marked with that Window's own counts: the copies
 * filled on it and the copiers it could not fill. A pass over two Windows never stamps one's counts on the other (it
 * used to mark each with the whole pass's totals, and `greatest(filled, …)` kept the inflated count).
 */
export async function executeCalls(input: {
  strategyId: string; candidates: readonly Candidate[]; subs: readonly SubscriberState[]; dryRun: boolean;
  store: Pick<StrategyStore, "markDecisionExecution">;
  execute: (sub: SubscriberState, call: Candidate) => Promise<ExecutionResult>;
  onFilled?: (sub: SubscriberState, call: Candidate, fill: Extract<ExecutionResult, { status: "filled" }>) => void;
}): Promise<CallsRun> {
  const run: CallsRun = { filled: 0, skips: [], notes: [], unknown: null };
  const windows: { marketId: string; filled: number; skips: SkipKind[] }[] = [];
  for (const call of input.candidates) {
    const w = { marketId: call.window.marketId, filled: 0, skips: [] as SkipKind[] };
    windows.push(w);
    for (const sub of input.subs) {
      const r = await input.execute(sub, call);
      if (r.status === "filled") {
        w.filled += 1;
        run.filled += 1;
        input.onFilled?.(sub, call, r);
        run.notes.push(`filled ${r.side.toUpperCase()} for ${sub.owner.slice(0, 8)} ${r.txHash.slice(0, 10)}`);
        continue;
      }
      run.notes.push(`${sub.owner.slice(0, 8)} ${r.status}: ${r.reason}`);
      if (r.status === "unknown") return { ...run, unknown: r.reason };
      if (r.status === "skipped" || r.status === "refused") {
        w.skips.push(r.code);
        run.skips.push(r.code);
      }
    }
  }
  for (const w of windows) {
    const missed = Object.values(tallySkips(w.skips)).reduce((a, b) => a + b, 0);
    await input.store.markDecisionExecution(input.strategyId, w.marketId, w.filled, missed, input.dryRun);
  }
  return run;
}

/**
 * Attempts this runner left open (a crash, or a send whose fate was unknown): settled from the receipt of the hash
 * stored once signed, or — no receipt after the expiring nonce's window — closed as never landed. One still open holds
 * every new entry (Masayume's rule: unknown is never resent).
 */
export async function recoverAttempts(client: OpsClient, rv: RunnerVenue, attempts: StrategyAttemptStore, runner: Address, log: (why: string) => void): Promise<number> {
  let open = 0;
  for (const a of await attempts.unresolved(runner)) {
    const key = { strategyId: a.strategyId, marketId: a.marketId, owner: a.owner, kind: a.kind };
    const ageMs = Date.now() - a.createdAtMs;
    if (!a.txHash) {
      // Reserved but never signed (no hash stored): nothing can land.
      if (ageMs > 5_000) await attempts.finish(key, "refused", null, "restarted before the order was signed");
      else open += 1;
      continue;
    }
    const receipt = await client.public.getTransactionReceipt({ hash: a.txHash as Hex }).catch(() => null);
    if (receipt?.status === "success") {
      const fill = runnerFillOf(receipt.logs, rv, a.owner as Address, a.marketId as Hex, BigInt(a.grantId));
      if (fill && fill.tokenDeltaRaw > 0n) {
        const block = await client.public.getBlock({ blockNumber: receipt.blockNumber });
        await attempts.recordFill({ txHash: a.txHash, strategyId: a.strategyId, grantId: a.grantId, owner: a.owner, marketId: a.marketId, side: a.side, mode: a.mode, cashDelta: fill.cashDeltaBase.toString(), tokenDelta: fill.tokenDeltaRaw.toString(), atSec: Number(block.timestamp), dryRun: false });
        log(`#${a.strategyId}: recovered a fill for ${a.owner} — ${a.txHash}`);
      } else await attempts.finish(key, "nothing-filled", a.txHash, "recovered: the IOC filled nothing");
    } else if (receipt) {
      await attempts.finish(key, "reverted", a.txHash, "recovered: the receipt says reverted");
    } else if (ageMs > (OPS_VALID_FOR_SEC + 30) * 1000) {
      await attempts.finish(key, "refused", a.txHash, "recovered: never landed inside its expiring window");
    } else open += 1;
  }
  return open;
}
