import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedisKv, type RedisKv } from "./kv";

/** Runs against a real throwaway redis-server this test starts and stops (skipped where none is installed). */
const hasRedis = spawnSync("redis-server", ["--version"]).status === 0;
const PORT = 16_391;

describe.skipIf(!hasRedis)("Redis Kv (D-061, C.3.2)", () => {
  let server: ChildProcess;
  let kv: RedisKv;
  beforeAll(async () => {
    server = spawn("redis-server", ["--port", String(PORT), "--save", "", "--appendonly", "no"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 300));
    kv = createRedisKv(`redis://127.0.0.1:${PORT}`, { prefix: "cwf:testnet:", sharedPrefix: "cwf:passkeys:", sharedPattern: /^credential:/ });
  });
  afterAll(async () => {
    await kv.close();
    server.kill("SIGTERM");
  });

  it("round-trips JSON with bigints, creates once, and takes exactly once", async () => {
    await kv.set("session:a", { n: 5n, s: "x" }, { ttl: 60 });
    expect(await kv.get("session:a")).toEqual({ n: 5n, s: "x" });
    expect(await kv.create!("challenge:c", 1, { ttl: 60 })).toBe(true);
    expect(await kv.create!("challenge:c", 2, { ttl: 60 })).toBe(false);
    const takes = await Promise.all([kv.take!("challenge:c"), kv.take!("challenge:c"), kv.take!("challenge:c")]);
    expect(takes.filter((v) => v !== undefined)).toEqual([1]);
    await kv.delete("session:a");
    expect(await kv.get("session:a")).toBeUndefined();
  });

  it("shares credentials across networks under one prefix and keeps the rest per network", async () => {
    const other = createRedisKv(`redis://127.0.0.1:${PORT}`, { prefix: "cwf:mainnet:", sharedPrefix: "cwf:passkeys:", sharedPattern: /^credential:/ });
    await kv.set("credential:abc", { publicKey: "0x01" });
    await kv.set("session:t", 1);
    expect(await other.get("credential:abc")).toEqual({ publicKey: "0x01" });
    expect(await other.get("session:t")).toBeUndefined();
    await other.close();
  });

  it("expires with the TTL", async () => {
    await kv.set("challenge:ttl", 1, { ttl: 1 });
    await new Promise((r) => setTimeout(r, 1_200));
    expect(await kv.get("challenge:ttl")).toBeUndefined();
  });
});
