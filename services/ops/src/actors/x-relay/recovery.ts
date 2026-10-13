// Ported in role from Masayume 68f7a09:services/ops/src/actors/x-relay/execution-recovery.ts and Mitoshi's
// `strategy-runner/execute.ts` `recoverAttempts` (S9.5) — S11 (D-227): a mention the executor left open (a crash, a
// send whose answer never came) is settled from the chain, never executed again.
import { parseEventLogs, type Address, type Hex } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import type { XReceipt } from "@cwf/core";
import type { XStore } from "@cwf/db";
import { OPS_VALID_FOR_SEC, runnerFillOf, type OpsClient, type XVenue } from "@cwf/markets/ops";

export interface RecoveryContext {
  client: OpsClient;
  xv: XVenue;
  store: Pick<XStore, "unresolved" | "saveReceipt">;
  executor: Address;
  log: (why: string) => void;
  nowMs?: number;
}

/** A send's fate is decided once its expiring nonce can no longer land. */
const DECIDED_AFTER_MS = (OPS_VALID_FOR_SEC + 30) * 1000;

function filled(r: XReceipt, txHash: string, cash: bigint, tokens: bigint): XReceipt {
  return { ...r, status: "filled", txHash, journalState: "confirmed", bookedCostBase: cash.toString(), bookedContractsRaw: tokens.toString(), avgPriceBps: Number((cash * 10_000n) / tokens), reason: null };
}

/**
 * Settles every open mention of this executor: from the receipt of its stored hash; or, with no hash (lost between
 * signing and storing), from the vault's `Executed` log for this owner, Window and grant since the checkpoint's block —
 * once the expiring nonce has lapsed. Returns how many remain open: any one holds every new mention.
 */
export async function recoverMentions(ctx: RecoveryContext): Promise<number> {
  let open = 0;
  const now = ctx.nowMs ?? Date.now();
  for (const r of await ctx.store.unresolved(ctx.executor)) {
    const owner = r.wallet as Address | null;
    const marketId = r.marketId as Hex | null;
    const grantId = r.grantId ? BigInt(r.grantId) : null;
    if (!owner || !marketId || grantId === null) {
      await ctx.store.saveReceipt({ ...r, status: "refused", refusalCode: "unconfirmed", reason: "Stopped before the order was built; nothing was sent." });
      continue;
    }
    if (r.txHash) {
      const receipt = await ctx.client.public.getTransactionReceipt({ hash: r.txHash as Hex }).catch(() => null);
      if (receipt?.status === "success") {
        const fill = runnerFillOf(receipt.logs, ctx.xv, owner, marketId, grantId);
        await ctx.store.saveReceipt(fill && fill.tokenDeltaRaw > 0n ? filled(r, r.txHash, fill.cashDeltaBase, fill.tokenDeltaRaw) : { ...r, status: "nothing-filled", reason: "Nothing was booked." });
        ctx.log(`mention ${r.mentionId}: recovered from ${r.txHash}`);
        continue;
      }
      if (receipt) {
        await ctx.store.saveReceipt({ ...r, status: "reverted", reason: "The vault rejected the trade." });
        continue;
      }
    }
    const age = now - (r.intentRecordedAtMs ?? r.atMs);
    if (age < DECIDED_AFTER_MS) {
      open += 1;
      continue;
    }
    // No hash, or a hash that never landed: the vault's own log is the last word.
    const from = r.recoveryFromBlock ? BigInt(r.recoveryFromBlock) : null;
    const logs = from !== null ? await ctx.client.public.getLogs({ address: ctx.xv.vault, fromBlock: from, toBlock: "latest" }).catch(() => null) : [];
    if (logs === null) {
      open += 1;
      continue;
    }
    const hit = parseEventLogs({ abi: eventVaultV2Abi, eventName: "Executed", logs: logs as never }).find(
      (l) => l.args.owner.toLowerCase() === owner.toLowerCase() && l.args.marketId.toLowerCase() === marketId.toLowerCase() && l.args.grantId === grantId && l.args.isBuy && l.args.actor.toLowerCase() === ctx.executor.toLowerCase(),
    );
    if (hit && hit.args.tokenDelta > 0n) await ctx.store.saveReceipt(filled(r, hit.transactionHash, hit.args.cashDelta, hit.args.tokenDelta));
    else await ctx.store.saveReceipt({ ...r, status: "refused", refusalCode: "unconfirmed", reason: "Never landed; nothing was booked." });
    ctx.log(`mention ${r.mentionId}: settled after restart (${hit ? hit.transactionHash : "never landed"})`);
  }
  return open;
}
