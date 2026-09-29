/**
 * The accounts SDK's `Kv` over the owner's Coolify Redis (D-061 replaces Upstash; C.3.2; D-055 "Kv.from over Redis
 * with an atomic take"). `create` is `SET NX`, `take` is `GETDEL`, TTLs are native `EX`, values are JSON (bigint-safe
 * through `ox/Json`). Keys are prefixed so passkey credentials share one namespace across networks while sessions and
 * challenges stay per network.
 */
import { Json } from "ox";
import { createClient, type RedisClientType } from "redis";
import { Kv } from "accounts/server";

export type RedisKv = ReturnType<typeof Kv.from> & { close(): Promise<void> };

/** One connection per process, created lazily and reused (route handlers are module-scope, D-055). */
export function createRedisKv(url: string, options: { prefix: string; sharedPrefix?: string; sharedPattern?: RegExp }): RedisKv {
  let client: RedisClientType | null = null;
  let connecting: Promise<RedisClientType> | null = null;
  const conn = async (): Promise<RedisClientType> => {
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
  const keyOf = (key: string) => (options.sharedPrefix && options.sharedPattern?.test(key) ? `${options.sharedPrefix}${key}` : `${options.prefix}${key}`);
  const parse = <T>(raw: string | null): T | undefined => (raw === null ? undefined : (Json.parse(raw) as T));

  const kv = Kv.from({
    async get<value = unknown>(key: string) {
      return parse<value>(await (await conn()).get(keyOf(key)));
    },
    async set(key, value, opts) {
      await (await conn()).set(keyOf(key), Json.stringify(value), opts?.ttl ? { EX: Math.max(1, Math.ceil(opts.ttl)) } : undefined);
    },
    async delete(key) {
      await (await conn()).del(keyOf(key));
    },
    async create(key, value, opts) {
      const res = await (await conn()).set(keyOf(key), Json.stringify(value), { NX: true, ...(opts?.ttl ? { EX: Math.max(1, Math.ceil(opts.ttl)) } : {}) });
      return res === "OK";
    },
    async take<value = unknown>(key: string) {
      return parse<value>(await (await conn()).getDel(keyOf(key)));
    },
  });
  return Object.assign(kv, {
    async close() {
      const c = client;
      client = null;
      if (c?.isOpen) await c.quit();
    },
  });
}
