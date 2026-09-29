/**
 * Intent → calls (plan C.2.3). Every area registers its encoder here when its contracts exist; until then its intents
 * answer a typed "not deployed" refusal. S1 ships the two area-free encoders: revoking an access key (the trust
 * surface) and the relay's no-op proof call. S4 adds the engine, S7 the vault, and so on.
 */
import { encodeFunctionData, multicall3Abi, type Address } from "viem";
import { Abis } from "viem/tempo";
import { diagnosis, type Diagnosis, type TxIntent } from "@cwf/core";
import { TEMPO, UTILITIES } from "@cwf/clients";
import type { Call } from "../tx/batch";

/** The relay area a call set belongs to; the relay policy for that area decides sponsorship. */
export type RelayArea = "noop" | "keys" | "engine" | "vault" | "parlay" | "range" | "maker" | "leverage" | "private" | "arena" | "strategies" | "stocks" | "themes" | "launch" | "bridge" | "agents";

export interface EncodedIntent {
  area: RelayArea;
  calls: Call[];
  /** Whether to ask the relay to pay; the relay still decides by policy. */
  sponsored: boolean;
  summary: string;
}

export type EncodeResult = { ok: true; value: EncodedIntent } | { ok: false; diagnosis: Diagnosis };

export interface EncodeContext {
  chainId: number;
  wallet: Address;
}

export type IntentEncoder = (intent: TxIntent, ctx: EncodeContext) => EncodeResult | null;

/** `AccountKeychain.revokeKey(keyId)`: sponsored everywhere (an exit must never need funds). */
function encodeKeyRevoke(intent: TxIntent): EncodeResult | null {
  if (intent.kind !== "key-revoke") return null;
  const data = encodeFunctionData({ abi: Abis.accountKeychain, functionName: "revokeKey", args: [intent.keyId] });
  return { ok: true, value: { area: "keys", calls: [{ to: TEMPO.accountKeychain, data }], sponsored: true, summary: `revoke key ${intent.keyId}` } };
}

/** Multicall3 `getCurrentBlockTimestamp()`: a view that moves nothing, proves the relay pays exactly what policy allows (S1 gate). */
function encodeNoop(intent: TxIntent): EncodeResult | null {
  if (intent.kind !== "noop") return null;
  const data = encodeFunctionData({ abi: multicall3Abi, functionName: "getCurrentBlockTimestamp" });
  return { ok: true, value: { area: "noop", calls: [{ to: UTILITIES.multicall3, data }], sponsored: true, summary: "sponsored no-op" } };
}

export const DEFAULT_ENCODERS: readonly IntentEncoder[] = [encodeKeyRevoke, encodeNoop];

/** The first encoder that claims the intent; an unclaimed intent's area is not deployed on this chain yet. */
export function encodeIntent(intent: TxIntent, ctx: EncodeContext, encoders: readonly IntentEncoder[] = DEFAULT_ENCODERS): EncodeResult {
  for (const encoder of encoders) {
    const result = encoder(intent, ctx);
    if (result) return result;
  }
  return { ok: false, diagnosis: diagnosis("not-deployed", `no encoder for ${intent.kind} on chain ${ctx.chainId}`) };
}
