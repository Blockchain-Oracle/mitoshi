/**
 * Intent → calls (plan C.2.3). Every area registers its encoder here when its contracts exist; until then its intents
 * answer a typed "not deployed" refusal. S1 ships the two area-free encoders: revoking an access key (the trust
 * surface) and the relay's no-op proof call. S4 adds the engine (`engine-encoders.ts`), S7 the vault, and so on.
 */
import { encodeFunctionData, erc20Abi, isAddress, multicall3Abi, type Address } from "viem";
import { accountKeychainAbi } from "../keys/keychain-abi";
import { diagnosis, type Diagnosis, type TxIntent } from "@cwf/core";
import { TEMPO, UTILITIES } from "@cwf/clients";
import type { Call } from "../tx/batch";
import { encodeEngineIntent } from "./engine-encoders";
import { encodeParlayIntent } from "../parlay/encoders";
import { encodeRangeIntent } from "../range/encoders";
import { encodeLeverageIntent } from "../leverage/encoders";
import { encodePrivateIntent } from "../private/encoders";
import { encodeArenaIntent } from "../arena/encoders";
import { registerAgentCall, setAgentUriCall } from "../agents/erc8004";
import { encodeStrategyIntent } from "../strategies/encoders";
import { encodeVaultIntent } from "../vault/calls";
import { encodeMakerIntent } from "../maker/calls";
import { encodeLaunchIntent } from "../launch/encoders";

/** The relay area a call set belongs to; the relay policy for that area decides sponsorship. */
/** The relay sponsors at most 8 calls per transaction (C.3.3). */
export const MAX_REVOKE = 8;

export type RelayArea = "wallet" | "noop" | "keys" | "engine" | "vault" | "vault2" | "parlay" | "range" | "maker" | "leverage" | "private" | "arena" | "strategies" | "launch" | "agents";

export interface EncodedIntent {
  area: RelayArea;
  calls: Call[];
  /** Several transactions for one intent (claim-all past 8 calls): `calls` is `batches[0]`; the lane sends them in order. */
  batches?: Call[][];
  /** Whether to ask the relay to pay; the relay still decides by policy. */
  sponsored: boolean;
  summary: string;
}

export type EncodeResult = { ok: true; value: EncodedIntent } | { ok: false; diagnosis: Diagnosis };

export interface EncodeContext {
  chainId: number;
  wallet: Address;
}

export type IntentEncoder = (intent: TxIntent, ctx: EncodeContext) => EncodeResult | null | Promise<EncodeResult | null>;

/** `AccountKeychain.revokeKey(keyId)` per key, in one transaction: sponsored everywhere (an exit must never need funds). */
function encodeKeyRevoke(intent: TxIntent): EncodeResult | null {
  if (intent.kind !== "key-revoke") return null;
  if (intent.keyIds.length === 0 || intent.keyIds.length > MAX_REVOKE) {
    return { ok: false, diagnosis: diagnosis("sponsor-refused", `the relay co-signs 1–${MAX_REVOKE} revokes per transaction (got ${intent.keyIds.length})`) };
  }
  const calls = intent.keyIds.map((keyId) => ({ to: TEMPO.accountKeychain, data: encodeFunctionData({ abi: accountKeychainAbi, functionName: "revokeKey", args: [keyId] }) }));
  return { ok: true, value: { area: "keys", calls, sponsored: true, summary: `revoke ${intent.keyIds.length} key(s)` } };
}

/** WebAuthn on the AccountKeychain's signature-type enum (0 secp256k1, 1 P-256, 2 WebAuthn). */
const WEBAUTHN_SIGNATURE = 2;
const NO_WITNESS = `0x${"0".repeat(64)}` as const;

/**
 * `AccountKeychain.authorizeAdminKey(keyId, WebAuthn, 0)` (TIP-1049, T6): a backup passkey as an admin key. Never
 * sponsored (the relay's `keys` policy refuses it): the account pays its own fee, which is why the prompt follows the
 * first deposit. The account's own key must sign it.
 */
function encodeKeyBackup(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (intent.kind !== "key-backup") return null;
  if (!isAddress(intent.keyId) || intent.keyId.toLowerCase() === ctx.wallet.toLowerCase()) return { ok: false, diagnosis: diagnosis("contract-revert", `not a backup key: ${intent.keyId}`) };
  const data = encodeFunctionData({ abi: accountKeychainAbi, functionName: "authorizeAdminKey", args: [intent.keyId, WEBAUTHN_SIGNATURE, NO_WITNESS] });
  return { ok: true, value: { area: "keys", calls: [{ to: TEMPO.accountKeychain, data }], sponsored: false, summary: `add backup passkey ${intent.keyId}` } };
}

/** ERC-8004 identity writes (S9, D-218.7): one sponsored call on the chain's IdentityRegistry. */
function encodeAgentIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (intent.kind !== "agent-register" && intent.kind !== "agent-set-uri") return null;
  try {
    const call = intent.kind === "agent-register" ? registerAgentCall(ctx.chainId, intent.agentURI) : setAgentUriCall(ctx.chainId, intent.agentId, intent.agentURI);
    return { ok: true, value: { area: "agents", calls: [call], sponsored: true, summary: intent.kind === "agent-register" ? "register an ERC-8004 agent" : `point agent #${intent.agentId} at a new registration file` } };
  } catch (error) {
    return { ok: false, diagnosis: diagnosis("not-deployed", error instanceof Error ? error.message : String(error)) };
  }
}

/** Multicall3 `getCurrentBlockTimestamp()`: a view that moves nothing, proves the relay pays exactly what policy allows (S1 gate). */
function encodeNoop(intent: TxIntent): EncodeResult | null {
  if (intent.kind !== "noop") return null;
  const data = encodeFunctionData({ abi: multicall3Abi, functionName: "getCurrentBlockTimestamp" });
  return { ok: true, value: { area: "noop", calls: [{ to: UTILITIES.multicall3, data }], sponsored: true, summary: "sponsored no-op" } };
}

/** A TIP-20 `transfer(to, amount)` from the wallet: never sponsored (the sender pays the fee); never to itself or zero. */
export function encodeTransfer(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (intent.kind !== "transfer") return null;
  if (!isAddress(intent.to) || /^0x0{40}$/i.test(intent.to)) return { ok: false, diagnosis: diagnosis("contract-revert", `not a valid destination: ${intent.to}`) };
  if (intent.to.toLowerCase() === ctx.wallet.toLowerCase()) return { ok: false, diagnosis: diagnosis("contract-revert", "the destination is this account") };
  if (intent.amountBase <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "nothing to send") };
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [intent.to, intent.amountBase] });
  return { ok: true, value: { area: "wallet", calls: [{ to: intent.token, data }], sponsored: false, summary: `send ${intent.amountBase} of ${intent.token} to ${intent.to}` } };
}

export const DEFAULT_ENCODERS: readonly IntentEncoder[] = [encodeKeyRevoke, encodeKeyBackup, encodeAgentIntent, encodeNoop, encodeTransfer, encodeEngineIntent, encodeVaultIntent, encodeMakerIntent, encodeLaunchIntent, encodeStrategyIntent, encodeParlayIntent, encodeRangeIntent, encodeLeverageIntent, encodePrivateIntent, encodeArenaIntent];

/** The first encoder that claims the intent; an unclaimed intent's area is not deployed on this chain yet. */
export async function encodeIntent(intent: TxIntent, ctx: EncodeContext, encoders: readonly IntentEncoder[] = DEFAULT_ENCODERS): Promise<EncodeResult> {
  for (const encoder of encoders) {
    const result = await encoder(intent, ctx);
    if (result) return result;
  }
  return { ok: false, diagnosis: diagnosis("not-deployed", `no encoder for ${intent.kind} on chain ${ctx.chainId}`) };
}
