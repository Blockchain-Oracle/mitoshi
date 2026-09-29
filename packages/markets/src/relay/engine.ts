/**
 * The relay policy engine (plan C.3.3), pure over its inputs so it is tested without a chain. Order:
 * chainId → from ≠ fee payer → calls ≤ 8, value 0, no CREATE → every `to` in the area's targets ∪ TIP-20 approvals ∪
 * Permit2 approvals → every selector sponsored, any `never` selector refuses the tx → geofence entry selectors →
 * approve spender in targets, amount ≠ max → async sender rule → gas ≤ area cap → fee token pathUSD → expiring
 * `validBefore ≤ now + 300`. Budgets (gates) run after this, debited only on raw sign/send.
 */
import { decodeFunctionData, maxUint256, toFunctionSelector, type Abi, type AbiFunction, type Address, type Hex } from "viem";
import { Abis } from "viem/tempo";
import { EXPIRING_NONCE_MAX_SEC, isRestricted } from "@cwf/core";
import { TEMPO, UTILITIES } from "@cwf/clients";
import type { PolicyVerdict, RefusalCode, RelayCall, RelayContext, RelayPolicy, RelayRequest } from "./types";
import { normalizeKeyAuthorization } from "./key-auth";

export const MAX_CALLS = 8;

/**
 * TIP-1000: the node's fill estimates 250,000 gas of account creation for a sender whose protocol nonce is 0 (D-070:
 * expiring-nonce sends leave it at 0, so the estimate keeps it even though execution does not charge it). The estimate
 * is the gas limit the policy sees, so the area cap is raised by exactly this — only when the chain reports nonce 0.
 */
export const NEW_ACCOUNT_GAS = 250_000n;

/** What the validator read from the chain about the sender before evaluating. */
export interface SenderFacts {
  isNew: boolean;
}

export interface EngineConfig {
  chainId: number;
  feePayer: Address;
  policies: readonly RelayPolicy[];
}

const lower = (a: string) => a.toLowerCase();

/** TIP-20s live at `0x20c0` + 12 zero bytes… (factory-created token ids); pathUSD is id 0. */
export function isTip20(address: Address): boolean {
  return /^0x20c0{21}/i.test(address);
}

function refuse(code: RefusalCode, reason: string): PolicyVerdict {
  return { ok: false, code, reason };
}

/** Function name of a call under an ABI, by selector; null when the selector isn't in the ABI. */
export function functionNameOf(abi: Abi, data: Hex): { name: string; args: readonly unknown[] } | null {
  if (data.length < 10) return null;
  const selector = data.slice(0, 10).toLowerCase();
  const fn = abi.find((item): item is AbiFunction => item.type === "function" && toFunctionSelector(item).toLowerCase() === selector);
  if (!fn) return null;
  try {
    const decoded = decodeFunctionData({ abi: [fn], data });
    return { name: fn.name, args: decoded.args ?? [] };
  } catch {
    return { name: fn.name, args: [] };
  }
}

function policyOf(policies: readonly RelayPolicy[], to: Address): RelayPolicy | null {
  return policies.find((p) => p.targets.some((t) => lower(t) === lower(to))) ?? null;
}

interface Approval {
  token: Address;
  spender: Address;
  amount: bigint;
}

function approvalOf(call: RelayCall): Approval | "not-approve" | "bad" {
  const to = call.to!;
  if (!isTip20(to) && lower(to) !== lower(UTILITIES.permit2)) return "not-approve";
  const decoded = functionNameOf(Abis.tip20 as Abi, call.data);
  if (!decoded || decoded.name !== "approve") return "bad";
  const [spender, amount] = decoded.args as [Address, bigint];
  return { token: to, spender, amount };
}

/** Evaluates a sponsorship request against every rule except budgets. */
export async function evaluate(config: EngineConfig, request: RelayRequest, ctx: RelayContext, sender: SenderFacts = { isNew: false }): Promise<PolicyVerdict> {
  if (request.chainId !== config.chainId) return refuse("chain", `chain ${request.chainId} is not ${config.chainId}`);
  if (!request.from) return refuse("self-sponsor", "no sender");
  if (lower(request.from) === lower(config.feePayer)) return refuse("self-sponsor", "the fee payer never sponsors itself");
  if (request.calls.length === 0 || request.calls.length > MAX_CALLS) return refuse("too-many-calls", `${request.calls.length} calls (1–${MAX_CALLS})`);

  let area: RelayPolicy | null = null;
  const approvals: Approval[] = [];
  for (const call of request.calls) {
    if (call.value !== 0n) return refuse("value", "no native value on Tempo");
    if (!call.to) return refuse("create", "contract creation is never sponsored");
    const approval = approvalOf(call);
    if (approval === "bad") return refuse("selector", `only approve is sponsored on ${call.to}`);
    if (approval !== "not-approve") {
      approvals.push(approval);
      continue;
    }
    const policy = policyOf(config.policies, call.to);
    if (!policy) return refuse("target", `${call.to} is not a sponsored target`);
    if (area && area.area !== policy.area) return refuse("target", `one area per transaction (${area.area} and ${policy.area})`);
    area = policy;
    const fn = functionNameOf(policy.abi, call.data);
    if (!fn) return refuse("selector", `unknown selector ${call.data.slice(0, 10)} on ${policy.area}`);
    if (policy.never.includes(fn.name)) return refuse("never", `${policy.area}.${fn.name} is never sponsored`);
    if (!policy.sponsor.includes(fn.name)) return refuse("selector", `${policy.area}.${fn.name} is not sponsored`);
    if (policy.pillar && isRestricted(ctx.region, policy.pillar) && policy.entry.includes(fn.name)) {
      return refuse("region", `${policy.area}.${fn.name} is browse-only in this region`);
    }
    if (policy.asyncSender && !(await policy.asyncSender({ from: request.from, call, functionName: fn.name, args: fn.args }))) {
      return refuse("sender", `${request.from} may not call ${policy.area}.${fn.name}`);
    }
  }
  if (!area) return refuse("target", "approvals alone are never sponsored");
  for (const a of approvals) {
    const spenderOk = area.targets.some((t) => lower(t) === lower(a.spender)) || (lower(a.spender) === lower(UTILITIES.permit2) && isTip20(a.token));
    if (!spenderOk) return refuse("approve-spender", `approve spender ${a.spender} is not a ${area.area} target`);
    if (a.amount === maxUint256) return refuse("approve-max", "unlimited approvals are never sponsored");
  }
  let keyGas = 0n;
  if (request.keyAuthorization) {
    // D-136: publishing a key is sponsored only in the shape the area's rule accepts (never an arbitrary key).
    if (!area.keyAuthorization) return refuse("key-auth", `${area.area} does not sponsor publishing an access key`);
    const why = area.keyAuthorization.check(request.keyAuthorization, ctx.nowSec);
    if (why) return refuse("key-auth", why);
    keyGas = area.keyAuthorization.extraGas;
  }
  const gasCap = area.maxGas + keyGas + (sender.isNew ? NEW_ACCOUNT_GAS : 0n);
  if (request.gas !== null && request.gas > gasCap) return refuse("gas", `gas ${request.gas} over the ${area.area} cap ${gasCap}`);
  if (request.feeToken !== null && lower(request.feeToken) !== lower(TEMPO.pathUSD)) return refuse("fee-token", "the fee token must be pathUSD");
  if (request.nonceKey === maxUint256) {
    if (request.validBefore === null || request.validBefore > ctx.nowSec + EXPIRING_NONCE_MAX_SEC) {
      return refuse("expiry", `expiring validBefore must be ≤ now + ${EXPIRING_NONCE_MAX_SEC}s`);
    }
  }
  return { ok: true, area: area.area, feeMicros: feeMicros(request) };
}

/** `ceil(gas × maxFeePerGas / 10¹²)`: attodollars per gas → microdollars (Tempo fee spec). */
export function feeMicros(request: Pick<RelayRequest, "gas" | "maxFeePerGas">): bigint {
  if (request.gas === null || request.maxFeePerGas === null) return 0n;
  const atto = request.gas * request.maxFeePerGas;
  return (atto + 999_999_999_999n) / 1_000_000_000_000n;
}

/** Normalises what `Handler.relay` hands `validate` (a viem Tempo TransactionRequest) into a RelayRequest. */
export function normalizeRequest(raw: Record<string, unknown>, fallbackChainId: number): RelayRequest {
  // viem encodes a zero quantity as "0x" (e.g. `value` on a sponsored fill); `BigInt("0x")` throws, so empty hex is 0.
  const big = (v: unknown): bigint | null => (typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : v === "0x" ? 0n : typeof v === "string" && v !== "" ? BigInt(v) : null);
  const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : typeof v === "string" && v !== "" ? Number(v) : null);
  const rawCalls = Array.isArray(raw.calls) && raw.calls.length > 0 ? (raw.calls as Record<string, unknown>[]) : [{ to: raw.to, data: raw.data ?? raw.input, value: raw.value }];
  return {
    chainId: num(raw.chainId) ?? fallbackChainId,
    from: typeof raw.from === "string" ? (raw.from as Address) : null,
    calls: rawCalls.map((c) => ({ to: typeof c.to === "string" ? (c.to as Address) : null, data: (typeof c.data === "string" ? c.data : "0x") as Hex, value: big(c.value) ?? 0n })),
    gas: big(raw.gas),
    maxFeePerGas: big(raw.maxFeePerGas),
    feeToken: typeof raw.feeToken === "string" ? (raw.feeToken as Address) : null,
    nonceKey: raw.nonceKey === "expiring" ? maxUint256 : big(raw.nonceKey),
    validBefore: num(raw.validBefore),
    keyAuthorization: normalizeKeyAuthorization(raw.keyAuthorization),
  };
}
