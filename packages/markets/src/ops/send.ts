/**
 * How a venue actor sends (plan C.2.3 row "actors": self-paid in pathUSD, expiring nonce, explicit priority fee; every
 * send through `tx/send.ts`). A single call is simulated first (`eth_call` from the role), so an engine refusal comes
 * back as its custom-error name without paying a fee — the actors map names to "look again" (Agari's
 * `OpsSendError.code`). A receipt with status reverted is an error too. Ported in role from Agari
 * 03b30ab:packages/markets/src/ops/send.ts (`sendOps`).
 */
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Hex, type TransactionReceipt } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { EXPIRING_NONCE_MAX_SEC } from "@cwf/core";
import type { Call } from "../tx/batch";
import { sendBatch } from "../tx/send";
import { chainNowSec, type OpsClient } from "./client";

export class OpsSendError extends Error {
  constructor(
    message: string,
    /** The engine custom error (`PrintTooLate`, `MarketAlreadyTerminal`, …) or null for anything else. */
    readonly errorName: string | null,
    readonly txHash: Hex | null = null,
  ) {
    super(message);
    this.name = "OpsSendError";
  }
}

/** Actor sends expire quickly: an absent tx is decided within a minute and the actor re-reads the chain. */
export const OPS_VALID_FOR_SEC = 60;

/**
 * The engine's errors, then the EventVault's (an actor that cranks the vault reads its refusals by name too, S7), then
 * v2's EXIT grant and the fair-value guard behind its floor (the exit keeper, S24.3).
 */
const ERROR_ABIS = [eventsEngineAbi, eventVaultAbi, eventVaultV2Abi, fairValueGuardAbi, strategyRegistryAbi] as const;

function decodeName(data: Hex): string | null {
  for (const abi of ERROR_ABIS) {
    try {
      return decodeErrorResult({ abi, data }).errorName;
    } catch {
      /* not this contract's error */
    }
  }
  return null;
}

/** The engine (or vault) error name inside a revert's data or message, or null. */
export function engineErrorName(error: unknown): string | null {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e; depth++) {
    if (e instanceof ContractFunctionRevertedError && e.data?.errorName) return e.data.errorName;
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
      const name = decodeName(data as Hex);
      if (name) return name;
    }
    e = (e as { cause?: unknown }).cause;
  }
  const text = error instanceof BaseError ? error.shortMessage + " " + error.details : String(error);
  const hex = /(0x[0-9a-fA-F]{8,})/.exec(text)?.[1];
  return hex ? decodeName(hex as Hex) : null;
}

/** The short message plus viem's details (the node's own words for an RPC error). */
const short = (error: unknown) => (error instanceof BaseError ? `${error.shortMessage}${error.details && !error.shortMessage.includes(error.details) ? ` (${error.details})` : ""}` : error instanceof Error ? error.message : String(error)).slice(0, 400);

/** Simulates a single call from the role; throws `OpsSendError` with the engine error name when it would revert. */
export async function preflight(client: OpsClient, call: Call): Promise<void> {
  if (!client.address) throw new OpsSendError("no role key: read-only client", null);
  try {
    await client.public.call({ account: client.address, to: call.to, data: call.data });
  } catch (error) {
    const name = engineErrorName(error);
    throw new OpsSendError(`simulation reverted${name ? `: ${name}` : `: ${short(error)}`}`, name);
  }
}

export interface OpsSent {
  hash: Hex;
  receipt: TransactionReceipt;
}

/**
 * Sends `calls` as one self-paid Tempo transaction from the role key and returns the successful receipt. `onSigned` gets
 * the hash before it is sent (an actor that must resume after a restart records it).
 */
export async function sendOps(client: OpsClient, calls: readonly Call[], options: { simulate?: boolean; nowSec?: number; onSigned?: (hash: Hex) => void } = {}): Promise<OpsSent> {
  if (!client.wallet) throw new OpsSendError("no role key: read-only client", null);
  if (calls.length === 1 && options.simulate !== false) await preflight(client, calls[0]!);
  const nowSec = options.nowSec ?? (await chainNowSec(client));
  let receipt: TransactionReceipt;
  try {
    // The split send: its raw send is retried with the same bytes while the gateway rate-limits (S24.4), and the hash is
    // known before the send (`onSigned`).
    ({ receipt } = await sendBatch(client.wallet, { calls, sponsored: false, nonce: { kind: "expiring", validForSec: Math.min(OPS_VALID_FOR_SEC, EXPIRING_NONCE_MAX_SEC) }, nowSec }, { onSigned: (hash) => void (hash && options.onSigned?.(hash)) }));
  } catch (error) {
    const name = engineErrorName(error);
    throw new OpsSendError(`send failed${name ? `: ${name}` : `: ${short(error)}`}`, name);
  }
  if (receipt.status !== "success") throw new OpsSendError(`reverted in block ${receipt.blockNumber}`, null, receipt.transactionHash);
  return { hash: receipt.transactionHash, receipt };
}
