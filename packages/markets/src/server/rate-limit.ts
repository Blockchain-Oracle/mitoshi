/**
 * Fixed-window rate limits over the same Redis (plan §3.2: "rate limits on /api/auth/* ceremony routes (per IP/device)").
 * `INCR` + `EXPIRE` on first hit: atomic enough for a limiter, shared by every instance.
 */
import { createClient, type RedisClientType } from "redis";

export interface RateLimiter {
  /** True when the key may proceed; counts the attempt either way. */
  allow(key: string, limit: number, windowSec: number): Promise<boolean>;
}

export function createRateLimiter(url: string, prefix: string): RateLimiter {
  let client: RedisClientType | null = null;
  let connecting: Promise<RedisClientType> | null = null;
  const conn = async () => {
    if (client?.isReady) return client;
    connecting ??= (async () => {
      const c = createClient({ url }) as RedisClientType;
      c.on("error", () => undefined);
      await c.connect();
      client = c;
      connecting = null;
      return c;
    })();
    return connecting;
  };
  return {
    async allow(key, limit, windowSec) {
      const c = await conn();
      const k = `${prefix}${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
      const n = await c.incr(k);
      if (n === 1) await c.expire(k, windowSec);
      return n <= limit;
    },
  };
}
