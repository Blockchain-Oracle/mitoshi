/**
 * The passkey ceremony handler (plan C.3.2; accounts 0.18.4 `Handler.webAuthn`): register/login/logout under `path`,
 * a 30-day session cookie (D-151: the browser restores a passkey connection with no ceremony, so a 24 h server session
 * left a signed-in user without one the next day — the stream ticket answered 401), credentials in the Redis `Kv` (shared across networks), challenges and sessions per network.
 * Built ONCE at module scope by the route (D-055). The route rate-limits the ceremony endpoints (production checklist).
 */
import { Handler, type Kv } from "accounts/server";
import { PublicKey } from "ox";
import { Address as OxAddress } from "ox";
import type { Address } from "@cwf/core";

export interface AuthHandlerConfig {
  kv: Kv.Kv;
  /** Expected origin(s) of the page running the ceremony. */
  origin: string | readonly string[];
  /** The relying-party id: the registrable domain (D-060: `mitoshi.xyz` on both networks), `localhost` locally. */
  rpId: string;
  path: string;
  cookieName?: string;
  /** Session lifetime in seconds (cookie Max-Age and the Kv TTL). */
  sessionTtlSec?: number;
}

/** 30 days: the session backs only the faucet claim and the stream ticket; the account's authority stays on chain. */
export const PASSKEY_SESSION_TTL_SEC = 30 * 24 * 60 * 60;

export function createAuthHandler(config: AuthHandlerConfig) {
  return Handler.webAuthn({
    kv: config.kv,
    origin: config.origin as string | string[],
    rpId: config.rpId,
    path: config.path,
    cookieName: config.cookieName ?? "cwf_passkey",
    ttl: { session: config.sessionTtlSec ?? PASSKEY_SESSION_TTL_SEC },
  });
}

export type AuthHandler = ReturnType<typeof createAuthHandler>;

/** The Tempo account address of a passkey's P-256 public key (the same derivation viem's `Account.fromWebAuthnP256` uses). */
export function passkeyAddress(publicKeyHex: string): Address {
  return OxAddress.fromPublicKey(PublicKey.fromHex(publicKeyHex as `0x${string}`)).toLowerCase() as Address;
}
