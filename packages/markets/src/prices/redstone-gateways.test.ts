import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRedstoneAt, fetchRedstoneLatest, PUBLIC_REDSTONE_GATEWAYS, redstoneGatewayName, redstoneGatewaysFromEnv, REDSTONE_KEY_INTERVAL_MS } from "./redstone-gateways";

const KEY = "rk_live_secret_value";
const PAIRS = JSON.stringify([{ url: "https://gw-a.example/", apiKey: KEY }, { url: "https://gw-b.example", apiKey: "rk_two" }]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RedStone gateways (D-210)", () => {
  it("reads the authenticated pairs, else the public gateways, and refuses a malformed secret", () => {
    expect(redstoneGatewaysFromEnv({ REDSTONE_GATEWAYS: PAIRS })).toEqual([{ url: "https://gw-a.example", apiKey: KEY }, { url: "https://gw-b.example", apiKey: "rk_two" }]);
    expect(redstoneGatewaysFromEnv({ REDSTONE_GATEWAY_URLS: "https://x.example/, https://y.example" })).toEqual([{ url: "https://x.example", apiKey: null }, { url: "https://y.example", apiKey: null }]);
    expect(redstoneGatewaysFromEnv({})).toEqual(PUBLIC_REDSTONE_GATEWAYS);
    expect(() => redstoneGatewaysFromEnv({ REDSTONE_GATEWAYS: "[]" })).toThrow(/non-empty/);
    expect(() => redstoneGatewaysFromEnv({ REDSTONE_GATEWAYS: '[{"url":"http://plain.example","apiKey":"k"}]' })).toThrow(/https/);
    expect(redstoneGatewayName({ url: "https://gw-a.example", apiKey: KEY })).toBe("https://gw-a.example (key)");
  });

  it("sends the key as x-api-key only, falls back to the second pair, and never puts a key in an error", async () => {
    const seen: Array<{ url: string; key: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const key = (init.headers as Record<string, string>)["x-api-key"] ?? null;
      seen.push({ url, key });
      if (url.startsWith("https://gw-a.example")) return new Response('{"error":"public_gateway_rejected"}', { status: 403 });
      return new Response('{"BTC":[]}', { status: 200 });
    }));
    const gateways = redstoneGatewaysFromEnv({ REDSTONE_GATEWAYS: PAIRS });
    const r = await fetchRedstoneAt(1_791_490_000, gateways);
    expect(r.gateway).toBe("https://gw-b.example");
    expect(seen.map((s) => s.key)).toEqual([KEY, "rk_two"]);
    expect(seen.every((s) => !s.url.includes(KEY))).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"public_gateway_rejected"}', { status: 403 })));
    const failure = await fetchRedstoneLatest(gateways, { shareMs: 0 }).catch((e: Error) => e.message);
    expect(failure).toMatch(/HTTP 403 public_gateway_rejected from https:\/\/gw-b\.example \(key\)/);
    expect(failure).not.toContain(KEY);
  });

  it("spaces one key's requests a second apart and shares one latest answer", async () => {
    const at: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => (at.push(Date.now()), new Response('{"ETH":[]}', { status: 200 }))));
    const one = [{ url: "https://gw-c.example", apiKey: "rk_pace" }];
    await Promise.all([fetchRedstoneAt(1, one), fetchRedstoneAt(2, one)]);
    expect(at).toHaveLength(2);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(REDSTONE_KEY_INTERVAL_MS - 20);
    // Two readers inside the share window get one fetch; `shareMs: 0` always fetches.
    const before = at.length;
    const shared = [{ url: "https://gw-d.example", apiKey: null }];
    const [a, b] = await Promise.all([fetchRedstoneLatest(shared), fetchRedstoneLatest(shared)]);
    expect(a).toBe(b);
    expect(at.length - before).toBe(1);
    await fetchRedstoneLatest(shared, { shareMs: 0 });
    expect(at.length - before).toBe(2);
  });
});
