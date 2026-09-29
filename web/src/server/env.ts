import "server-only";
/**
 * Server-only configuration (names in `infra/env/web.*.example`; values in Coolify, never in git). Read lazily so a
 * build without secrets still compiles every route; a route that needs a missing secret answers 503 with a named
 * reason instead of crashing.
 */
import { networkFrom, TEMPO_RPC_HTTP, type Network } from "@cwf/core";

export interface ServerEnv {
  network: Network;
  appOrigin: string;
  rpId: string;
  rpcHttpUrl: string;
  redisUrl: string | null;
  databaseUrl: string | null;
  feePayerKey: `0x${string}` | null;
  socialSecret: string | null;
  regionOverride: string | null;
}

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const network = networkFrom(process.env.NETWORK);
  const appOrigin = process.env.APP_ORIGIN || "http://localhost:3000";
  const key = process.env.RELAY_FEE_PAYER_PRIVATE_KEY;
  cached = {
    network,
    appOrigin,
    rpId: process.env.PASSKEY_RP_ID || new URL(appOrigin).hostname,
    rpcHttpUrl: process.env.TEMPO_RPC_HTTP_URL || TEMPO_RPC_HTTP[network],
    redisUrl: process.env.REDIS_URL || null,
    databaseUrl: process.env.DATABASE_URL || null,
    feePayerKey: key && /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as `0x${string}`) : null,
    socialSecret: process.env.SOCIAL_SESSION_SECRET || null,
    regionOverride: process.env.CWF_REGION_OVERRIDE || null,
  };
  return cached;
}

export class MissingConfigError extends Error {
  constructor(readonly what: string) {
    super(`${what} is not configured on this deployment`);
    this.name = "MissingConfigError";
  }
}

export function unavailable(error: MissingConfigError): Response {
  return Response.json({ error: "unavailable", reason: error.message }, { status: 503, headers: { "cache-control": "no-store" } });
}
