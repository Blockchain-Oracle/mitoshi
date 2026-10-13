// Ported from Masayume 68f7a09:services/ops/src/actors/x-relay/env.ts (and its pre-9b077b1 official-API names) — S11
// (D-227): both ways in to X configured side by side, the executor key from `X_EXECUTOR_PRIVATE_KEY` or the `x-relay`
// role key, and an actor-level switch for signing (`X_RELAY_LIVE`), so the relay is dry by default even where the rest
// of ops signs.
import type { Hex } from "viem";
import type { Network } from "@cwf/core";
import { roleKey } from "../../runtime/keys";
import type { OAuth1Credentials } from "./oauth1";

export interface RelayEnv {
  /** The bot's handle, without `@`. */
  handle: string | null;
  /** The bot account's session for Rettiwt (base64 of `auth_token=…;ct0=…;twid=…;`). Never logged. */
  rettiwtApiKey: string | null;
  /** The developer app's OAuth 1.0a user context for the bot account: reads mentions and posts replies on the X API. */
  oauth1: OAuth1Credentials | null;
  /** App-only bearer: reads only (the X API's pay-per-use plan). */
  bearerToken: string | null;
  /** The executor key an EXECUTOR grant names (`X_EXECUTOR_PRIVATE_KEY`, else the `x-relay` role key). Never logged. */
  executorKey: Hex | null;
  /** Signs only with `X_RELAY_LIVE=1` (and ops' `DRY_RUN=0`). */
  live: boolean;
  postingEnabled: boolean;
  /** The receipt card goes with each reply unless `X_REPLY_IMAGES_ENABLED` is `0`/`false` (Owarine's default). */
  replyImages: boolean;
  pollMs: number;
  /** Missing pieces, by variable name, for the heartbeat. */
  missing: string[];
}

export const RELAY_ENV = {
  handle: "X_HANDLE",
  rettiwtKey: "X_RETTIWT_API_KEY",
  apiKey: "X_API_KEY",
  apiKeySecret: "X_API_KEY_SECRET",
  accessToken: "X_ACCESS_TOKEN",
  accessTokenSecret: "X_ACCESS_TOKEN_SECRET",
  bearer: "X_BEARER_TOKEN",
  executor: "X_EXECUTOR_PRIVATE_KEY",
  live: "X_RELAY_LIVE",
  posting: "X_POSTING_ENABLED",
  images: "X_REPLY_IMAGES_ENABLED",
  poll: "X_POLL_MS",
} as const;

const DEFAULT_POLL_MS = 20_000;
const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;
const on = (v: string | undefined) => v === "1" || v === "true";

/** All four or none: a half-pasted OAuth 1.0a set signs nothing. */
export function readOAuth1(env: NodeJS.ProcessEnv): OAuth1Credentials | null {
  const c = { consumerKey: env.X_API_KEY ?? "", consumerSecret: env.X_API_KEY_SECRET ?? "", accessToken: env.X_ACCESS_TOKEN ?? "", accessTokenSecret: env.X_ACCESS_TOKEN_SECRET ?? "" };
  return Object.values(c).every((v) => v.length > 0) ? c : null;
}

export function readRelayEnv(network: Network, env: NodeJS.ProcessEnv = process.env, keysDir?: string): RelayEnv {
  const handle = (env.X_HANDLE ?? "").trim().replace(/^@/, "") || null;
  const rettiwtApiKey = env.X_RETTIWT_API_KEY?.trim() || null;
  const oauth1 = readOAuth1(env);
  const bearerToken = env.X_BEARER_TOKEN?.trim() || null;
  const explicit = env.X_EXECUTOR_PRIVATE_KEY?.trim();
  const executorKey = explicit && HEX_KEY.test(explicit) ? (explicit as Hex) : roleKey("x-relay", network, env, keysDir);
  const missing: string[] = [];
  if (!handle) missing.push(RELAY_ENV.handle);
  if (!rettiwtApiKey && !oauth1 && !bearerToken) missing.push(`${RELAY_ENV.rettiwtKey} or ${RELAY_ENV.accessToken}`);
  if (!executorKey) missing.push(RELAY_ENV.executor);
  const poll = Number(env.X_POLL_MS);
  return {
    handle, rettiwtApiKey, oauth1, bearerToken, executorKey, missing,
    live: on(env.X_RELAY_LIVE),
    postingEnabled: on(env.X_POSTING_ENABLED),
    replyImages: env.X_REPLY_IMAGES_ENABLED !== "0" && env.X_REPLY_IMAGES_ENABLED !== "false",
    pollMs: Number.isFinite(poll) && poll >= 5_000 ? poll : DEFAULT_POLL_MS,
  };
}
