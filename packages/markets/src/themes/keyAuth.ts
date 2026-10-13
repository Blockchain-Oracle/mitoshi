/**
 * The theme agent key's TIP-1011 authorization (plan B.4.3, D-023, D-100): one secp256k1 key per (follower, theme),
 * held by ops, scoped so it can only (a) call `ThemeRouter.rebalance` and (b) `approve` the router on pathUSD and each
 * theme token — never `transfer`, never `allowAnyCalls`, limits enforced. Periodic (daily) limits count only direct
 * TIP-20 `approve` increases (research 16 §4.3), which is why the router pulls with exact approvals the key raises.
 *
 * Two shapes, same restrictions (D-100 picks between them from spike X4):
 *   - `themeKeyAuthorizeCall`: `AccountKeychain.authorizeKey(keyId, secp256k1, restrictions)` as a call in the root's
 *     own batch `[authorizeKey, router.follow]` — one root signature (one passkey prompt);
 *   - `themeKeyAuthorization`: the tx-level `key_authorization` object (viem `signKeyAuthorization`) — a second root
 *     signature over the authorization digest.
 * Docs: tempo docs protocol/tips/tip-1011 (scopes, recipient binding, gas), protocol/transactions/AccountKeychain;
 * viem `viem/tempo` Account.signKeyAuthorization, Abis.accountKeychain.
 */
import { type Address, type Hex, encodeFunctionData, getAddress, toFunctionSelector } from "viem";
import { Abis, Addresses } from "viem/tempo";

/** `ThemeRouter.rebalance(uint64 themeId, Trade[] trades, bytes priceProof, bytes32 decisionId)`. */
export const REBALANCE_SIGNATURE = "rebalance(uint64,(address,address,uint128,uint128)[],bytes,bytes32)";
export const REBALANCE_SELECTOR: Hex = toFunctionSelector(`function ${REBALANCE_SIGNATURE}`);
export const APPROVE_SELECTOR: Hex = "0x095ea7b3";
export const DAY = 86_400;
/** At most this many target scopes per `setAllowedCalls` chunk when the authorization is split (B.4.3). */
export const SCOPE_CHUNK = 5;

export interface ThemeKeyParams {
  keyId: Address;
  router: Address;
  /** Theme tokens (mirrors), not including pathUSD. */
  tokens: readonly Address[];
  /** Key expiry, unix seconds; the follow's `caps.expiry` must not exceed it. */
  expirySec: number;
  /** pathUSD daily limit (caps.maxDailyUsd + fee headroom), base units. */
  pathUsdDailyLimit: bigint;
  /** Per-token daily limit in token base units (ceil(maxDailyUsd / P_t × 1.2)), same order as `tokens`. */
  tokenDailyLimits: readonly bigint[];
}

export interface TokenLimit { token: Address; amount: bigint; period: number }
export interface SelectorRule { selector: Hex; recipients: Address[] }
export interface CallScope { target: Address; selectorRules: SelectorRule[] }

/** The daily limits: pathUSD first, then each theme token. */
export function themeKeyLimits(p: ThemeKeyParams): TokenLimit[] {
  if (p.tokens.length !== p.tokenDailyLimits.length) throw new Error("one daily limit per theme token");
  const pathUsd = getAddress(Addresses.pathUsd);
  const seen = new Set<string>([pathUsd]);
  const out: TokenLimit[] = [{ token: pathUsd, amount: p.pathUsdDailyLimit, period: DAY }];
  p.tokens.forEach((t, i) => {
    const token = getAddress(t);
    if (seen.has(token)) throw new Error(`duplicate token ${token}`);
    seen.add(token);
    out.push({ token, amount: p.tokenDailyLimits[i]!, period: DAY });
  });
  return out;
}

/** The call scopes: router.rebalance, then approve@router on pathUSD and each theme token (recipient-bound). */
export function themeKeyScopes(p: Pick<ThemeKeyParams, "router" | "tokens">): CallScope[] {
  const router = getAddress(p.router);
  const approve = (target: Address): CallScope => ({ target: getAddress(target), selectorRules: [{ selector: APPROVE_SELECTOR, recipients: [router] }] });
  return [
    { target: router, selectorRules: [{ selector: REBALANCE_SELECTOR, recipients: [] }] },
    approve(Addresses.pathUsd),
    ...p.tokens.map(approve),
  ];
}

/**
 * `KeyRestrictions (expiry, enforceLimits, limits, allowAnyCalls, allowedCalls)` for `AccountKeychain.authorizeKey`, as
 * the ABI tuple (`scopes` defaults to the full B.4.3 set).
 */
export function themeKeyRestrictions(p: ThemeKeyParams, scopes: CallScope[] = themeKeyScopes(p)) {
  return [BigInt(p.expirySec), true, themeKeyLimits(p).map((l) => ({ ...l, period: BigInt(l.period) })), false, scopes] as const;
}

/** The keychain call `authorizeKey(keyId, Secp256k1, restrictions)` for the root's batch. */
export function themeKeyAuthorizeCall(p: ThemeKeyParams, scopes?: CallScope[]): { to: Address; data: Hex } {
  return {
    to: getAddress(Addresses.accountKeychain),
    data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: "authorizeKey", args: [getAddress(p.keyId), 0, themeKeyRestrictions(p, scopes)] } as never),
  };
}

/** `setAllowedCalls(keyId, scopes)` chunks of ≤ SCOPE_CHUNK targets (the split shape's tx 2+). */
export function themeKeySetAllowedCallsChunks(keyId: Address, scopes: CallScope[], chunk = SCOPE_CHUNK): { to: Address; data: Hex }[] {
  const out: { to: Address; data: Hex }[] = [];
  for (let i = 0; i < scopes.length; i += chunk) {
    out.push({
      to: getAddress(Addresses.accountKeychain),
      data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: "setAllowedCalls", args: [getAddress(keyId), scopes.slice(i, i + chunk)] } as never),
    });
  }
  return out;
}

/**
 * Gas, measured on Moderato in spike X4 (acceptance/S16.md C, D; D-100): ≈ 0.5M per daily limit, ≈ 2.03M per call scope,
 * ≈ 0.93M for `follow`. A split follow's first transaction carries every limit, the router and pathUSD scopes and as
 * many token scopes as keep it under FOLLOW_TX_GAS (the relay's follow cap is 22M); the rest go in chunks of ≤ 5.
 */
export const LIMIT_GAS = 500_000;
export const SCOPE_GAS = 2_030_000;
export const FOLLOW_TX_GAS = 20_000_000;
const FOLLOW_BASE_GAS = 1_300_000;

/** How many theme-token scopes ride in the follow transaction for a theme of `tokenCount` tokens (all of them ≤ 5). */
export function followTxTokenScopes(tokenCount: number): number {
  if (tokenCount <= SCOPE_CHUNK) return tokenCount;
  const fixed = FOLLOW_BASE_GAS + LIMIT_GAS * (tokenCount + 1) + SCOPE_GAS * 2;
  return Math.max(0, Math.min(SCOPE_CHUNK, Math.floor((FOLLOW_TX_GAS - fixed) / SCOPE_GAS)));
}

/** The split: theme tokens scoped in the follow tx, then each later `setAllowedCalls` chunk's tokens (≤ 5 each). */
export function splitFollowTokens<T>(tokens: readonly T[]): { first: T[]; chunks: T[][] } {
  const k = followTxTokenScopes(tokens.length);
  const chunks: T[][] = [];
  for (let i = k; i < tokens.length; i += SCOPE_CHUNK) chunks.push(tokens.slice(i, i + SCOPE_CHUNK));
  return { first: tokens.slice(0, k), chunks };
}

/** The same restrictions in viem's `signKeyAuthorization` shape (flat scopes, `limit` field). */
export function themeKeyAuthorization(p: ThemeKeyParams) {
  const expiry = p.expirySec; // viem's field name
  return {
    expiry,
    limits: themeKeyLimits(p).map((l) => ({ token: l.token, limit: l.amount, period: l.period })),
    scopes: themeKeyScopes(p).flatMap((s) => s.selectorRules.map((r) => ({ address: s.target, selector: r.selector, ...(r.recipients.length ? { recipients: r.recipients } : {}) }))),
  };
}
