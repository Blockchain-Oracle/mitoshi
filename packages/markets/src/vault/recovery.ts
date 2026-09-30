// Ported from Masayume 68f7a09:packages/markets/src/vault/recovery.ts — the nonce-match search becomes the expiring
// window (L-08): a tap that has no receipt once its `validBefore` has passed can never land, so the vault's own
// `Executed` events since the record decide "landed" vs "absent". Read-only; nothing here ever re-sends (AD-3).
/**
 * Killed-tab recovery for vault writes: the tab closed between the key's signature and the receipt, so the journal
 * holds an open record with no digest. On the next session, after `validBefore` (+ grace), the vault's `Executed` logs
 * for that Window since the record was written say whether the tap went through — matched on the actor (the signer the
 * record names), never on the Window alone.
 */
import { getAbiItem, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import type { IntentRecord } from "@cwf/core";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { nowSec } from "../runtime/clock";
import { LOG_WINDOW } from "../provider/chain-logs";
import { reconcileRecord, type AreaEvidence, type ReconcileVerdict } from "../submitter/reconcile";
import type { Reconciler } from "../submitter/recovery";
import { vaultDeploymentOf } from "./read";

const EXECUTED = getAbiItem({ abi: eventVaultAbi, name: "Executed" });
/** Blocks per second on Moderato is ≈ 2 (0.5 s blocks); the search starts this far before the record, for clock skew. */
const BLOCKS_PER_SEC = 2n;
const SKEW_BLOCKS = 120n;

/** The vault's evidence for an open record: an `Executed` by the record's signer on its Window since it was written. */
export const vaultEvidence: AreaEvidence = async (wallet: Address, record: IntentRecord, sinceSec: number) => {
  if (record.kind !== "order" || !record.marketId) return "unknown";
  const [client, logs] = await Promise.all([getPublicClient(), getLogClient()]);
  const deployment = vaultDeploymentOf(client.chain.id);
  if (!deployment) return "unknown";
  const head = await logs.getBlock();
  const back = BigInt(Math.max(0, Number(head.timestamp) - sinceSec)) * BLOCKS_PER_SEC + SKEW_BLOCKS;
  const floor = head.number > back ? head.number - back : 0n;
  const from = floor > deployment.fromBlock ? floor : deployment.fromBlock;
  for (let start = from; start <= head.number; start += LOG_WINDOW) {
    const end = start + LOG_WINDOW - 1n < head.number ? start + LOG_WINDOW - 1n : head.number;
    const found = await logs.getLogs({ address: deployment.eventVault, event: EXECUTED, args: { marketId: record.marketId as Hex }, fromBlock: start, toBlock: end });
    if (found.some((log) => !log.removed && (log.args as { actor?: Address }).actor?.toLowerCase() === wallet.toLowerCase())) return "landed";
  }
  return "absent";
};

/** The reconciler for a vault signer's journal: the receipt when there is a digest, the vault's events when there is not. */
export const vaultReconciler: Reconciler = async (wallet, record): Promise<ReconcileVerdict> =>
  reconcileRecord({ client: await getPublicClient(), wallet, record, chainNowSec: nowSec(), evidence: vaultEvidence });
