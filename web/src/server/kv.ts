import "server-only";
/** The one Redis `Kv` for passkey ceremonies (plan C.3.2): credentials shared across networks, the rest per network. */
import { createRedisKv, type RedisKv } from "@cwf/markets/server";
import { MissingConfigError, serverEnv } from "./env";

let kv: RedisKv | null = null;

export function passkeyKv(): RedisKv {
  if (kv) return kv;
  const env = serverEnv();
  if (!env.redisUrl) throw new MissingConfigError("REDIS_URL");
  kv = createRedisKv(env.redisUrl, { prefix: `cwf:${env.network}:`, sharedPrefix: "cwf:passkeys:", sharedPattern: /^credential:/ });
  return kv;
}
