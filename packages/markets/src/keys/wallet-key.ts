/**
 * The wallet-mode access key (D-047; spike X20): a TIP-1011 key authorized in the sign-in ceremony so taps sign with no
 * prompt. Restrictions (Q-031 defaults): a daily pathUSD limit ($25 / 24 h) — which counts every `approve` the key
 * signs, so each tap is capped — expiry 24 h, and call scopes limited to the engine's placeOrder / cancelOrders /
 * redeem / withdrawCredit plus `pathUSD.approve` bound to the engine as spender. Nothing else: no transfer, no other
 * contract, no `mintSet`. The shape is viem's `signKeyAuthorization` / the accounts SDK's `accessKey.authorize`
 * (`{ expiry, limits: [{ token, limit, period }], scopes: [{ address, selector, recipients }] }`); docs: viem
 * tempo/actions/accessKey.authorize + accessKey.signAuthorization (Context7 /wevm/viem), TIP-1011.
 */
import { getAbiItem, getAddress, toFunctionSelector, type Address, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";

export const WALLET_KEY_DAILY_LIMIT_BASE = 25_000_000n; // $25, Q-031
export const WALLET_KEY_PERIOD_SEC = 86_400;
export const WALLET_KEY_VALID_FOR_SEC = 86_400; // 24 h, renewable in one tap (Q-031)

/** The engine functions the key may call. */
export const WALLET_KEY_ENGINE_FUNCTIONS = ["placeOrder", "cancelOrders", "redeem", "withdrawCredit"] as const;
export const APPROVE_SELECTOR: Hex = "0x095ea7b3";

export const engineSelector = (name: (typeof WALLET_KEY_ENGINE_FUNCTIONS)[number] | string): Hex => toFunctionSelector(getAbiItem({ abi: eventsEngineAbi, name: name as never }) as never);

export interface WalletKeyScope {
  address: Address;
  selector: Hex;
  recipients?: Address[];
}

export interface WalletKeyAuthorization {
  /** Unix seconds (viem's field name). */
  "expiry": number;
  limits: { token: Address; limit: bigint; period: number }[];
  scopes: WalletKeyScope[];
}

export function walletKeyScopes(engine: Address, pathUsd: Address): WalletKeyScope[] {
  const e = getAddress(engine);
  return [
    ...WALLET_KEY_ENGINE_FUNCTIONS.map((name) => ({ address: e, selector: engineSelector(name) })),
    { address: getAddress(pathUsd), selector: APPROVE_SELECTOR, recipients: [e] },
  ];
}

export function walletKeyAuthorization(input: { engine: Address; pathUsd: Address; nowSec: number; dailyLimitBase?: bigint; validForSec?: number }): WalletKeyAuthorization {
  const limit = input.dailyLimitBase ?? WALLET_KEY_DAILY_LIMIT_BASE;
  if (limit <= 0n) throw new Error("the wallet key needs a positive daily limit");
  return {
    "expiry": input.nowSec + (input.validForSec ?? WALLET_KEY_VALID_FOR_SEC),
    limits: [{ token: getAddress(input.pathUsd), limit, period: WALLET_KEY_PERIOD_SEC }],
    scopes: walletKeyScopes(input.engine, input.pathUsd),
  };
}
