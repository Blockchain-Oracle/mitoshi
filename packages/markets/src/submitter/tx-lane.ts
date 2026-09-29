/**
 * The write lane every non-order intent rides (Masayume 68f7a09:packages/markets/src/submitter/tx-lane.ts, rebuilt
 * for Tempo; AD-3): encode → journal the intent (chain, nonce kind, expiry window, sponsorship) → one atomic send via
 * `tx/send.ts` → book from the receipt → diagnose. A timeout is "unknown" and reconciled later, never re-sent.
 */
import type { Account, Chain, Transport, WalletClient } from "viem";
import { diagnosis, type Address, type IntentJournal, type PhaseListener, type TxIntent, type TxOutcome } from "@cwf/core";
import { diagnose } from "../errors/error-map";
import { sendBatch } from "../tx/send";
import { nonceKindOf, validBeforeOf, nonceFields, type NoncePlan } from "../tx/nonce";
import { encodeIntent, type IntentEncoder } from "./encoders";

export interface TxLaneContext {
  journal: IntentJournal;
  client: WalletClient<Transport, Chain, Account>;
  wallet: Address;
  /** Whether this signer can ask for sponsorship (injected wallets can't carry a fee payer, X8). */
  canSponsor: boolean;
  nowSec: () => number;
  encoders?: readonly IntentEncoder[];
  /** Expiring by default (keys and passkeys); a protocol nonce for owner sends that must be ordered. */
  nonce?: NoncePlan;
}

function isTimeout(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /timed? ?out|TimeoutError|WaitForTransactionReceiptTimeout/i.test(text);
}

export async function submitTx(ctx: TxLaneContext, intent: TxIntent, onPhase?: PhaseListener): Promise<TxOutcome> {
  const chainId = ctx.client.chain.id;
  const encoded = encodeIntent(intent, { chainId, wallet: ctx.wallet }, ctx.encoders);
  if (!encoded.ok) return { status: "refused", diagnosis: encoded.diagnosis };
  const { calls, summary } = encoded.value;
  const sponsored = encoded.value.sponsored && ctx.canSponsor;
  const plan: NoncePlan = ctx.nonce ?? { kind: "expiring" };
  const nowSec = ctx.nowSec();
  const record = await ctx.journal.record({
    kind: intent.kind, wallet: ctx.wallet, summary, chainId,
    validBeforeSec: validBeforeOf(nonceFields(plan, nowSec)), nonceKind: nonceKindOf(plan), sponsored,
  });
  onPhase?.("submitted");
  try {
    const { receipt, hash } = await sendBatch(ctx.client, { calls, sponsored, nonce: plan, nowSec });
    await ctx.journal.markSent(record.id, hash);
    if (receipt.status === "reverted") {
      await ctx.journal.markFailed(record.id, "reverted on chain");
      onPhase?.("reverted", { txHash: hash });
      return { status: "reverted", diagnosis: diagnosis("contract-revert", `${summary} reverted`, { txHash: hash }), txHash: hash };
    }
    await ctx.journal.markConfirmed(record.id);
    onPhase?.("confirmed", { txHash: hash });
    return { status: "confirmed", txHash: hash };
  } catch (error) {
    const diag = diagnose(error);
    if (isTimeout(error)) {
      await ctx.journal.markUnknown(record.id);
      onPhase?.("unknown");
      return { status: "unknown", diagnosis: diagnosis("send-unknown", diag.technical) };
    }
    await ctx.journal.markFailed(record.id, diag.technical);
    onPhase?.("composing");
    return { status: "refused", diagnosis: diag };
  }
}
