/**
 * The fee relay's policy vocabulary (plan C.3.3; N-02). A policy per area names its targets and which functions it
 * sponsors, never sponsors, and treats as entry actions for the geofence. Selectors are resolved by function name from
 * the generated ABIs, so a policy cannot drift from the contract (C.3.3 last line).
 */
import type { Abi, Address, Hex } from "viem";
import type { GeofencePillar, RegionPosture } from "@cwf/core";
import type { RelayArea } from "../submitter/encoders";
import type { KeyAuthorizationRule, RelayKeyAuthorization } from "./key-auth";

export interface RelayCall {
  to: Address | null;
  data: Hex;
  value: bigint;
}

/** A sponsorship request, normalised from a viem Tempo `TransactionRequest` (fill or raw). */
export interface RelayRequest {
  chainId: number;
  from: Address | null;
  calls: RelayCall[];
  gas: bigint | null;
  maxFeePerGas: bigint | null;
  feeToken: Address | null;
  nonceKey: bigint | null;
  validBefore: number | null;
  /** A tx-level TIP-1011 key authorization the transaction publishes (D-136), or null. */
  keyAuthorization: RelayKeyAuthorization | null;
}

/** The request context the route puts in AsyncLocalStorage before the module-scope handler runs. */
export interface RelayContext {
  /** The JSON-RPC method: only raw sign/send methods debit budgets (validate also runs on fill). */
  method: string;
  /** `x-cwf-device` (per-install id), for per-device gates. */
  device: string | null;
  region: RegionPosture;
  nowSec: number;
}

/** The one chain read an async sender rule needs (the relay's own public client; any viem client fits). */
export interface RelayReader {
  readContract(args: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<unknown>;
}

export interface AsyncSenderCheck {
  /**
   * Async sender rule (e.g. vault `placeFor` needs `grantOf(id).actor == from && isGrantLive`). `read` is the relay's
   * chain reader; null where the relay was built without one, and a rule that needs the chain then refuses (fails closed).
   */
  (input: { from: Address; call: RelayCall; functionName: string; args: readonly unknown[]; read: RelayReader | null }): Promise<boolean>;
}

/**
 * A call from another area that may ride in this area's transaction — an exit that belongs with this one (stop = the
 * vault's `revoke` + the registry's `unsubscribe`, D-218.2). The call still passes its own area's policy (sponsor list,
 * never list, sender rule); this only lifts "one area per transaction" for the named functions, and adds their gas.
 */
export interface RelayCompanion {
  area: RelayArea;
  functions: readonly string[];
  extraGas: bigint;
}

export interface RelayPolicy {
  area: RelayArea;
  /** The area's contracts on this chain. */
  targets: readonly Address[];
  abi: Abi;
  /** Function names the relay pays for. */
  sponsor: readonly string[];
  /** Function names that refuse the whole transaction (capital intake, D-020). */
  never: readonly string[];
  /** The geofence pillar whose restricted visitors may not call `entry` functions (exits stay open). */
  pillar: GeofencePillar | null;
  entry: readonly string[];
  /** Upper bound on sponsored gas for one transaction in this area. */
  maxGas: bigint;
  asyncSender?: AsyncSenderCheck;
  /** Which tx-level key authorizations this area sponsors publishing (D-136); absent = none. */
  keyAuthorization?: KeyAuthorizationRule;
  /** Other areas' calls this area's transaction may carry; absent = none (one area per transaction). */
  companions?: readonly RelayCompanion[];
  /**
   * The AccountKeychain precompile is no area's contract, so a call to it is never sponsored on its own; an area whose
   * whole-transaction shapes include it (themes' `[authorizeKey, follow]`, D-100) names it here and answers which of its
   * root-signed shapes the full call list matches, or null (R4-11, D-227: the engine refused the follow shape).
   */
  keychainBatch?: { keychain: Address; match: (calls: readonly { to: Address; data: Hex }[]) => string | null };
}

export type RefusalCode =
  | "chain" | "self-sponsor" | "too-many-calls" | "value" | "create" | "target" | "selector" | "never" | "region"
  | "approve-spender" | "approve-max" | "sender" | "gas" | "fee-token" | "expiry" | "budget" | "breaker" | "decode" | "malformed" | "key-auth";

export type PolicyVerdict = { ok: true; area: RelayArea; feeMicros: bigint } | { ok: false; code: RefusalCode; reason: string };
