/**
 * Receipt reads the bridge needs beyond LayerZero Scan (S14w; D-227 R4-12): whether a source transaction reverted, and
 * whether a delivered credit was held — the Tempo adapter's `CreditDeferred` or the Robinhood lockbox's
 * `UnlockDeferred` inside the delivery transaction. Browser-safe (the tracker) and used by ops `bridge-watch`.
 */
import { parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { DEFER_REASONS, type DeferReason } from "@cwf/core";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import { lockboxExtraAbi } from "./abis";

/** A source or destination receipt's outcome; null while the chain has none. */
export async function receiptStatus(client: PublicClient, tx: Hex): Promise<"success" | "reverted" | null> {
  try {
    return (await client.getTransactionReceipt({ hash: tx })).status;
  } catch {
    return null;
  }
}

export interface Deferral {
  to: Address;
  amount: bigint;
  reason: DeferReason;
}

/** A Tempo credit the adapter deferred inside a delivery transaction (`CreditDeferred`), or null. */
export async function tempoDeferral(client: PublicClient, tx: Hex, adapter: Address): Promise<Deferral | null> {
  const receipt = await client.getTransactionReceipt({ hash: tx });
  const [log] = parseEventLogs({ abi: tIP20MintBurnAdapterAbi, eventName: "CreditDeferred", logs: receipt.logs.filter((l) => l.address.toLowerCase() === adapter.toLowerCase()) });
  return log ? { to: log.args.to, amount: log.args.amountLD, reason: DEFER_REASONS[log.args.reason] ?? "call-reverted" } : null;
}

/** A Robinhood unlock the lockbox owed instead of transferring (`UnlockDeferred`), or null. */
export async function robinhoodDeferral(client: PublicClient, tx: Hex, lockbox: Address): Promise<Deferral | null> {
  const receipt = await client.getTransactionReceipt({ hash: tx });
  const [log] = parseEventLogs({ abi: lockboxExtraAbi, eventName: "UnlockDeferred", logs: receipt.logs.filter((l) => l.address.toLowerCase() === lockbox.toLowerCase()) });
  return log ? { to: log.args.to, amount: log.args.amountLD, reason: "call-reverted" } : null;
}

