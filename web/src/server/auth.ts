import "server-only";
/** The passkey ceremony handler, built once per process (D-055), and the ceremony rate limiter. */
import { createAuthHandler, createRateLimiter, type AuthHandler, type RateLimiter } from "@cwf/markets/server";
import { MissingConfigError, serverEnv } from "./env";
import { passkeyKv } from "./kv";

export const AUTH_PATH = "/api/auth";

let handler: AuthHandler | null = null;
let limiter: RateLimiter | null = null;

export function authHandler(): AuthHandler {
  if (handler) return handler;
  const env = serverEnv();
  handler = createAuthHandler({ kv: passkeyKv(), origin: env.appOrigin, rpId: env.rpId, path: AUTH_PATH });
  return handler;
}

export function ceremonyLimiter(): RateLimiter {
  if (limiter) return limiter;
  const url = serverEnv().redisUrl;
  if (!url) throw new MissingConfigError("REDIS_URL");
  limiter = createRateLimiter(url, `cwf:${serverEnv().network}:rl:`);
  return limiter;
}
