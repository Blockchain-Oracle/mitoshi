/**
 * The wallet-mode access key (D-047, D-136, D-138): the ONE shape the relay sponsors publishing, built by
 * `@cwf/markets` `walletKeyAuthorization()` so this module and the relay rule cannot drift (S4 backend handoff). Scopes:
 * the engine's place / cancel / cancelAll / redeem / withdrawCredit and pathUSD `approve` bound to the engine; a daily
 * pathUSD limit that counts new approvals (Q-031: $25 per 24 h, D-138); expiry 24 h. While the engine is not deployed
 * on this network there is nothing to authorise.
 *
 * Arming is an explicit, offered step (D-046: the ceremony's arm slot, and the ticket's one-tap chip): the arm calls the
 * passkey provider's `wallet_authorizeAccessKey` once (one biometric); the accounts SDK keeps the key (a non-extractable
 * WebCrypto P-256 key) and signs every later call it covers with no prompt, publishing the authorization with the first
 * one (sponsored, D-136). The connector's default hook answers only while an arm is running, so sign-up itself never
 * adds a second prompt. Docs: accounts 0.18 `wallet_authorizeAccessKey` (core/zod/rpc.ts), viem tempo
 * accessKey.authorize.
 */
import { deploymentOf, PATH_USD, walletKeyAuthorization, type WalletKeyAuthorization } from "@cwf/markets";
import { numberToHex, type Address } from "viem";
import { TEMPO_CHAIN_ID } from "./chain-id";

let armRequested = false;

export function requestArm(on: boolean): void {
  armRequested = on;
}

/** The engine this network trades on; null where it is not deployed (the arm is then not offered). */
export function engineAddress(chainId: number = TEMPO_CHAIN_ID): Address | null {
  return (deploymentOf("engine", chainId)?.EventsEngine?.address as Address | undefined) ?? null;
}

/** The key's terms, fresh from now; null before the engine exists on this chain. */
export function walletKeyTerms(nowSec: number = Math.floor(Date.now() / 1000)): WalletKeyAuthorization | null {
  const engine = engineAddress();
  return engine ? walletKeyAuthorization({ engine, pathUsd: PATH_USD, nowSec }) : null;
}

/** The connector's `accessKey.authorize` hook: the terms while an arm runs, nothing otherwise. */
export function accessKeyPolicy() {
  return armRequested ? (walletKeyTerms() ?? undefined) : undefined;
}

/** `wallet_authorizeAccessKey` params, RPC-encoded (bigints as hex, as the accounts schema decodes them). */
export function walletKeyRpcParams(terms: WalletKeyAuthorization, chainId: number = TEMPO_CHAIN_ID) {
  return {
    chainId: numberToHex(chainId),
    expiry: terms.expiry,
    limits: terms.limits.map((l) => ({ token: l.token, limit: numberToHex(l.limit), period: l.period })),
    scopes: terms.scopes.map((s) => ({ address: s.address, selector: s.selector, ...(s.recipients ? { recipients: s.recipients } : {}) })),
  };
}
