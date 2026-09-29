/**
 * The fee relay's policy vocabulary (plan C.3.3; N-02). A policy per area names its targets and which functions it
 * sponsors, never sponsors, and treats as entry actions for the geofence. Selectors are resolved by function name from
 * the generated ABIs, so a policy cannot drift from the contract (C.3.3 last line).
 */
import type { Abi, Address, Hex } from "viem";
import type { GeofencePillar, RegionPosture } from "@cwf/core";
import type { RelayArea } from "../submitter/encoders";

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

export interface AsyncSenderCheck {
  /** Async sender rule (e.g. vault `placeFor` needs `grantOf(id).actor == from && isGrantLive`). */
  (input: { from: Address; call: RelayCall; functionName: string; args: readonly unknown[] }): Promise<boolean>;
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
}

export type RefusalCode =
  | "chain" | "self-sponsor" | "too-many-calls" | "value" | "create" | "target" | "selector" | "never" | "region"
  | "approve-spender" | "approve-max" | "sender" | "gas" | "fee-token" | "expiry" | "budget" | "breaker" | "decode" | "malformed";

export type PolicyVerdict = { ok: true; area: RelayArea; feeMicros: bigint } | { ok: false; code: RefusalCode; reason: string };
