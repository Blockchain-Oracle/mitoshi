/**
 * How a venue actor sends (plan C.2.3 row "actors": self-paid in pathUSD, expiring nonce, explicit priority fee; every
 * send through `tx/send.ts`). A single call is simulated first (`eth_call` from the role), so an engine refusal comes
 * back as its custom-error name without paying a fee — the actors map names to "look again" (Agari's
 * `OpsSendError.code`). A receipt with status reverted is an error too. Ported in role from Agari
 * 03b30ab:packages/markets/src/ops/send.ts (`sendOps`).
 */
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Hex, type TransactionReceipt } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
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

/** The engine error name inside a revert's data or message, or null. */
export function engineErrorName(error: unknown): string | null {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e; depth++) {
    if (e instanceof ContractFunctionRevertedError && e.data?.errorName) return e.data.errorName;
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
      try {
        return decodeErrorResult({ abi: eventsEngineAbi, data: data as Hex }).errorName;
      } catch {
        /* not an engine error */
      }
    }
    e = (e as { cause?: unknown }).cause;
  }
  const text = error instanceof BaseError ? error.shortMessage + " " + error.details : String(error);
  const hex = /(0x[0-9a-fA-F]{8,})/.exec(text)?.[1];
  if (hex) {
    try {
      return decodeErrorResult({ abi: eventsEngineAbi, data: hex as Hex }).errorName;
    } catch {
      /* not an engine error */
    }
  }
  return null;
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

/** Sends `calls` as one self-paid Tempo transaction from the role key and returns the successful receipt. */
export async function sendOps(client: OpsClient, calls: readonly Call[], options: { simulate?: boolean; nowSec?: number } = {}): Promise<OpsSent> {
  if (!client.wallet) throw new OpsSendError("no role key: read-only client", null);
  if (calls.length === 1 && options.simulate !== false) await preflight(client, calls[0]!);
  const nowSec = options.nowSec ?? (await chainNowSec(client));
  let receipt: TransactionReceipt;
  try {
    ({ receipt } = await sendBatch(client.wallet, { calls, sponsored: false, nonce: { kind: "expiring", validForSec: Math.min(OPS_VALID_FOR_SEC, EXPIRING_NONCE_MAX_SEC) }, nowSec }));
  } catch (error) {
    const name = engineErrorName(error);
    throw new OpsSendError(`send failed${name ? `: ${name}` : `: ${short(error)}`}`, name);
  }
  if (receipt.status !== "success") throw new OpsSendError(`reverted in block ${receipt.blockNumber}`, null, receipt.transactionHash);
  return { hash: receipt.transactionHash, receipt };
}
