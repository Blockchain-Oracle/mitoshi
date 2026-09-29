/**
 * Tx-level TIP-1011 key authorizations in sponsorship requests (D-136). The wallet-mode key (D-047) is published with
 * its first tap, which makes that transaction ≈ 4M gas heavier (measured on Moderato, X20). The relay sponsors such a
 * transaction only when the area's policy has a rule for the authorization it carries and the rule accepts it; any
 * other key authorization refuses the whole transaction (`key-auth`) — the relay never pays to create an arbitrary
 * key. Both request shapes are read: viem's (`address`, `limits[].limit`, `scopes[].address/selector/recipients`) and
 * the node's RPC shape (`keyId`, hex limits, `allowedCalls[].target/selectorRules`). Docs: ox `tempo/KeyAuthorization`.
 */
import { getAddress, isHex, toFunctionSelector, type Address, type Hex } from "viem";

export interface RelayKeyScope {
  target: Address;
  selector: Hex;
  /** Empty = any recipient. */
  recipients: Address[];
}

export interface RelayKeyAuthorization {
  keyId: Address;
  isAdmin: boolean;
  /** Unix seconds; null = never expires. */
  expirySec: number | null;
  limits: { token: Address; limit: bigint; periodSec: number }[];
  /** null = unrestricted (any call). */
  scopes: RelayKeyScope[] | null;
}

export interface KeyAuthorizationRule {
  /** Gas the relay adds to the area's cap for a transaction that publishes an accepted authorization. */
  extraGas: bigint;
  /** Null when acceptable; otherwise why not. */
  check(auth: RelayKeyAuthorization, nowSec: number): string | null;
}

const big = (v: unknown): bigint => (typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : typeof v === "string" && v !== "" && v !== "0x" ? BigInt(v) : 0n);
const selectorOf = (s: unknown): Hex => {
  const text = String(s ?? "");
  if (isHex(text) && text.length === 10) return text.toLowerCase() as Hex;
  return toFunctionSelector(text.startsWith("function ") ? text : `function ${text}`).toLowerCase() as Hex;
};

/** Reads either shape; null when the field is absent; throws on a malformed authorization (the caller refuses). */
export function normalizeKeyAuthorization(raw: unknown): RelayKeyAuthorization | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") throw new Error("keyAuthorization is not an object");
  const a = raw as Record<string, unknown>;
  const keyId = getAddress(String(a.address ?? a.keyId));
  const expiryRaw = a.expiry;
  const expirySec = expiryRaw === null || expiryRaw === undefined ? null : Number(big(expiryRaw));
  const limits = ((a.limits as Record<string, unknown>[] | undefined) ?? []).map((l) => ({ token: getAddress(String(l.token)), limit: big(l.limit), periodSec: Number(big(l.period)) }));
  let scopes: RelayKeyScope[] | null = null;
  if (Array.isArray(a.scopes)) {
    scopes = (a.scopes as Record<string, unknown>[]).map((s) => ({
      target: getAddress(String(s.address)),
      selector: selectorOf(s.selector),
      recipients: ((s.recipients as string[] | undefined) ?? []).map((r) => getAddress(r)),
    }));
  } else if (Array.isArray(a.allowedCalls)) {
    scopes = (a.allowedCalls as Record<string, unknown>[]).flatMap((c) =>
      ((c.selectorRules as Record<string, unknown>[] | undefined) ?? [{ selector: "0x00000000" }]).map((r) => ({
        target: getAddress(String(c.target)),
        selector: selectorOf(r.selector),
        recipients: ((r.recipients as string[] | undefined) ?? []).map((x) => getAddress(x)),
      })),
    );
  }
  return { keyId, isAdmin: a.isAdmin === true, expirySec: expirySec === 0 ? null : expirySec, limits, scopes };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A rule accepting exactly a scoped, limited, expiring key: no admin keys, an expiry within `maxValidForSec`, limits
 * only on the listed tokens (each periodic and ≤ its cap), and every scope in `allowed` (a recipient-bound selector
 * must name only allowed recipients). Anything wider refuses.
 */
export function scopedKeyRule(input: {
  extraGas: bigint;
  maxValidForSec: number;
  limitCaps: readonly { token: Address; maxLimit: bigint }[];
  allowed: readonly { target: Address; selector: Hex; recipients?: readonly Address[] }[];
}): KeyAuthorizationRule {
  return {
    extraGas: input.extraGas,
    check(auth, nowSec) {
      if (auth.isAdmin) return "admin keys are never sponsored";
      if (auth.expirySec === null || auth.expirySec > nowSec + input.maxValidForSec) return `the key must expire within ${input.maxValidForSec}s`;
      if (auth.limits.length === 0) return "the key must carry a spending limit";
      for (const l of auth.limits) {
        const cap = input.limitCaps.find((c) => same(c.token, l.token));
        if (!cap) return `no limit may name ${l.token}`;
        if (l.periodSec <= 0) return "limits must be periodic";
        if (l.limit > cap.maxLimit) return `limit ${l.limit} over the cap ${cap.maxLimit}`;
      }
      if (auth.scopes === null) return "an unrestricted key is never sponsored";
      if (auth.scopes.length === 0) return "the key has no allowed calls";
      for (const s of auth.scopes) {
        const rule = input.allowed.find((r) => same(r.target, s.target) && same(r.selector, s.selector));
        if (!rule) return `scope ${s.target}:${s.selector} is not allowed`;
        if (rule.recipients) {
          if (s.recipients.length === 0) return `scope ${s.target}:${s.selector} must be recipient-bound`;
          if (!s.recipients.every((r) => rule.recipients!.some((x) => same(x, r)))) return `scope ${s.target}:${s.selector} names another recipient`;
        }
      }
      return null;
    },
  };
}
