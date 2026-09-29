/**
 * The MPP payer's TIP-1011 access key (plan C.5.3): the root (`MPP_ROOT_ADDRESS`) authorizes one secp256k1 key with
 * periodic spending limits on the tokens MPP services charge in, and call scopes that allow only what a payment
 * needs — a TIP-20 `transfer`/`transferWithMemo` (charge intent) and the TIP-1034 channel escrow (session intent).
 * Limits count every direct transfer, the fee pre-charge and the escrow's implicit pull (16 §4.3), so the key can never
 * spend more than the limit per period whatever the software above it does. A token with no limit entry has limit 0.
 *
 * Built here, sent by the root (a keychain mutator needs the root as `tx.origin`): scripts pass `call` to `cast`.
 * Docs: tempo-std `IAccountKeychain.sol`, TIP-1011 (context/tempo/16 §4), viem `viem/tempo` `Abis.accountKeychain`.
 */
import { encodeFunctionData, getAddress, toFunctionSelector, type Address, type PublicClient } from "viem";
import { Abis, Addresses } from "viem/tempo";
import type { Network } from "@cwf/core";
import type { Call } from "../tx/batch";

/** The canonical TIP-1034 channel escrow the Tempo MPP services name in session challenges (X10). */
export const MPP_ESCROW: Address = "0x4d50500000000000000000000000000000000000";

/** USDC.e on Tempo mainnet: the currency anthropic.mpp.tempo.xyz lists first in its charge challenges (X10). */
export const USDC_E: Address = "0x20c000000000000000000000b9537d11c60e8b50";

/** One day, the period every payer limit uses. */
export const PAYER_LIMIT_PERIOD_SEC = 86_400;

export interface PayerLimit {
  token: Address;
  /** Base units per period (6-decimal stablecoins). */
  amountBase: bigint;
  periodSec: number;
}

/**
 * Default daily limits. Testnet: Moderato pathUSD (the Tempo Indexer API charges testnet queries in it, X10).
 * Mainnet: USDC.e and pathUSD, only once the owner approves the wallet (Q-020); the owner may change the figures.
 */
export function defaultPayerLimits(network: Network): PayerLimit[] {
  const pathUsd = getAddress(Addresses.pathUsd);
  if (network === "testnet") return [{ token: pathUsd, amountBase: 5_000_000n, periodSec: PAYER_LIMIT_PERIOD_SEC }];
  return [
    { token: getAddress(USDC_E), amountBase: 2_000_000n, periodSec: PAYER_LIMIT_PERIOD_SEC },
    { token: pathUsd, amountBase: 2_000_000n, periodSec: PAYER_LIMIT_PERIOD_SEC },
  ];
}

const SELECTORS = {
  transfer: toFunctionSelector("transfer(address,uint256)"),
  transferWithMemo: toFunctionSelector("transferWithMemo(address,uint256,bytes32)"),
} as const;

export interface PayerKeyInput {
  /** The access key's address (`keyId`). */
  keyId: Address;
  limits: readonly PayerLimit[];
  /** Unix seconds; omitted = never expires (u64::MAX at the ABI boundary; never 0). */
  expirySec?: number;
}

const U64_MAX = 2n ** 64n - 1n;

/** The scopes: each limited token may `transfer`/`transferWithMemo` to anyone (the recipient varies by service); the escrow any selector. */
export function payerScopes(limits: readonly PayerLimit[]) {
  const tokens = [...new Set(limits.map((l) => getAddress(l.token)))];
  return [
    ...tokens.map((target) => ({
      target,
      selectorRules: [
        { selector: SELECTORS.transfer, recipients: [] as Address[] },
        { selector: SELECTORS.transferWithMemo, recipients: [] as Address[] },
      ],
    })),
    { target: getAddress(MPP_ESCROW), selectorRules: [] },
  ];
}

/** `AccountKeychain.authorizeKey(keyId, Secp256k1, {expiry, enforceLimits: true, limits, allowAnyCalls: false, scopes})`. */
export function authorizePayerKeyCall(input: PayerKeyInput): Call {
  if (input.limits.length === 0) throw new Error("an MPP payer key needs at least one spending limit");
  const seen = new Set<string>();
  for (const l of input.limits) {
    const key = l.token.toLowerCase();
    if (seen.has(key)) throw new Error(`duplicate limit for ${l.token}`);
    seen.add(key);
    if (l.amountBase <= 0n) throw new Error(`limit for ${l.token} must be positive`);
    if (l.periodSec <= 0) throw new Error(`limit for ${l.token} must be periodic`);
  }
  const data = encodeFunctionData({
    abi: Abis.accountKeychain,
    functionName: "authorizeKey",
    args: [
      input.keyId,
      0, // SignatureType.Secp256k1
      // KeyRestrictions, positional: (expiry, enforceLimits, limits, allowAnyCalls, allowedCalls).
      [
        input.expirySec === undefined ? U64_MAX : BigInt(input.expirySec),
        true,
        input.limits.map((l) => ({ token: getAddress(l.token), amount: l.amountBase, period: BigInt(l.periodSec) })),
        false,
        payerScopes(input.limits),
      ] as never,
    ],
  });
  return { to: getAddress(Addresses.accountKeychain), data };
}

/** `AccountKeychain.revokeKey(keyId)` — permanent; the id can never be re-authorized. */
export function revokePayerKeyCall(keyId: Address): Call {
  return { to: getAddress(Addresses.accountKeychain), data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: "revokeKey", args: [keyId] }) };
}

export interface PayerKeyState {
  authorized: boolean;
  revoked: boolean;
  expirySec: bigint;
  limits: { token: Address; remainingBase: bigint; periodEndSec: bigint }[];
}

/** Reads the key and its remaining allowance per token — the funds-watch and `/status` probe. */
export async function readPayerKey(client: PublicClient, root: Address, keyId: Address, tokens: readonly Address[]): Promise<PayerKeyState> {
  const keychain = getAddress(Addresses.accountKeychain);
  const key = (await client.readContract({ address: keychain, abi: Abis.accountKeychain, functionName: "getKey", args: [root, keyId] })) as { keyId: Address; isRevoked: boolean } & Record<"expiry", bigint>;
  const limits = await Promise.all(
    tokens.map(async (token) => {
      const [remaining, periodEnd] = (await client.readContract({
        address: keychain,
        abi: Abis.accountKeychain,
        functionName: "getRemainingLimitWithPeriod",
        args: [root, keyId, token],
      })) as readonly [bigint, bigint];
      return { token, remainingBase: remaining, periodEndSec: periodEnd };
    }),
  );
  const authorized = key.keyId.toLowerCase() === keyId.toLowerCase();
  return { authorized, revoked: key.isRevoked, expirySec: key.expiry, limits };
}

