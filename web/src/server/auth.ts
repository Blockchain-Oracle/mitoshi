import "server-only";
/**
 * The passkey ceremony handler, built once per process (D-055), and the ceremony rate limiter. On testnet it also
 * accepts the Android app's ceremonies, whose clientDataJSON carries `android:apk-key-hash:…` rather than the page's
 * origin (WebView WebAuthn FOR_APP; D-227, MOBILE). The iOS app's carry the page's own origin.
 */
import { createAuthHandler, createRateLimiter, type AuthHandler, type RateLimiter } from "@cwf/markets/server";
import { ANDROID_PASSKEY_ORIGINS } from "@/lib/app-links";
import { MissingConfigError, serverEnv } from "./env";
import { passkeyKv } from "./kv";

export const AUTH_PATH = "/api/auth";

let handler: AuthHandler | null = null;
let limiter: RateLimiter | null = null;

export function authHandler(): AuthHandler {
  if (handler) return handler;
  const env = serverEnv();
  const origin = env.network === "testnet" ? [env.appOrigin, ...ANDROID_PASSKEY_ORIGINS] : env.appOrigin;
  handler = createAuthHandler({ kv: passkeyKv(), origin, rpId: env.rpId, path: AUTH_PATH });
  return handler;
}

export function ceremonyLimiter(): RateLimiter {
  if (limiter) return limiter;
  const url = serverEnv().redisUrl;
  if (!url) throw new MissingConfigError("REDIS_URL");
  limiter = createRateLimiter(url, `cwf:${serverEnv().network}:rl:`);
  return limiter;
}
