import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRedstoneAt, fetchRedstoneLatest, PUBLIC_REDSTONE_GATEWAYS, REDSTONE_BLOCK_COOLDOWN_MS, REDSTONE_COOLDOWN_MS, redstoneAnswerName, redstoneGatewayName, redstoneGatewaysFromEnv, REDSTONE_KEY_INTERVAL_MS, resetRedstoneCooldowns } from "./redstone-gateways";

const KEY = "rk_live_secret_value";
const PAIRS = JSON.stringify([{ url: "https://gw-a.example/", apiKey: KEY }, { url: "https://gw-b.example", apiKey: "rk_two" }]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetRedstoneCooldowns();
});

describe("RedStone gateways (D-210)", () => {
  it("reads the authenticated pairs, else the public gateways, and refuses a malformed secret", () => {
    const keyed = [{ url: "https://gw-a.example", apiKey: KEY }, { url: "https://gw-b.example", apiKey: "rk_two" }];
    expect(redstoneGatewaysFromEnv({ REDSTONE_GATEWAYS: PAIRS, REDSTONE_PUBLIC_FALLBACK: "0" })).toEqual(keyed);
    expect(redstoneGatewaysFromEnv({ REDSTONE_GATEWAY_URLS: "https://x.example/, https://y.example", REDSTONE_PUBLIC_FALLBACK: "0" })).toEqual([{ url: "https://x.example", apiKey: null }, { url: "https://y.example", apiKey: null }]);
    expect(redstoneGatewaysFromEnv({})).toEqual(PUBLIC_REDSTONE_GATEWAYS);
    // D-230: every gateway the process knows, keyed first, the public pair last, a URL asked once (its keyed entry).
    const all = redstoneGatewaysFromEnv({ REDSTONE_GATEWAYS: PAIRS, REDSTONE_GATEWAY_URLS: `https://gw-b.example,${PUBLIC_REDSTONE_GATEWAYS[1]!.url}` });
    expect(all).toEqual([...keyed, ...PUBLIC_REDSTONE_GATEWAYS.slice(1), PUBLIC_REDSTONE_GATEWAYS[0]]);
    expect(redstoneGatewaysFromEnv({ REDSTONE_PUBLIC_FALLBACK: "0" })).toEqual(PUBLIC_REDSTONE_GATEWAYS);
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
    const gateways = redstoneGatewaysFromEnv({ REDSTONE_GATEWAYS: PAIRS, REDSTONE_PUBLIC_FALLBACK: "0" });
    const r = await fetchRedstoneAt(1_791_490_000, gateways);
    expect(r.gateway).toBe("https://gw-b.example");
    expect(redstoneAnswerName(r)).toBe("https://gw-b.example (key)");
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

  it("rests a CDN block a minute, doubling, and the first answer resets it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let calls = 0;
    let answer = 403;
    vi.stubGlobal("fetch", vi.fn(async () => (calls++, new Response(answer === 200 ? '{"BTC":[]}' : "<HTML><H1>403 ERROR</H1>Request blocked.</HTML>", { status: answer }))));
    const one = [{ url: "https://gw-e.example", apiKey: null }];
    await expect(fetchRedstoneAt(1, one)).rejects.toThrow(/HTTP 403 blocked by the CDN/);
    await expect(fetchRedstoneAt(2, one)).rejects.toThrow(/resting 60 s/);
    expect(calls).toBe(1);
    vi.setSystemTime(Date.now() + REDSTONE_BLOCK_COOLDOWN_MS.first);
    await expect(fetchRedstoneAt(3, one)).rejects.toThrow(/HTTP 403/);
    await expect(fetchRedstoneAt(4, one)).rejects.toThrow(/resting 120 s/);
    vi.setSystemTime(Date.now() + 2 * REDSTONE_BLOCK_COOLDOWN_MS.first);
    answer = 200;
    await expect(fetchRedstoneAt(5, one)).resolves.toMatchObject({ gateway: "https://gw-e.example" });
    answer = 403;
    await expect(fetchRedstoneAt(6, one)).rejects.toThrow(/HTTP 403/);
    await expect(fetchRedstoneAt(7, one)).rejects.toThrow(/resting 60 s/);
    expect(calls).toBe(4);
  });

  it("probes RedStone's switch-off window every 30 s, doubling to two minutes (D-230), and falls through to the next gateway", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      asked.push(new URL(url).host);
      return url.startsWith("https://gw-r.example") ? new Response('{"error":"public_gateway_rejected"}', { status: 403 }) : new Response('{"BTC":[]}', { status: 200 });
    }));
    const two = [{ url: "https://gw-r.example", apiKey: null }, { url: "https://gw-s.example", apiKey: null }];
    await expect(fetchRedstoneAt(1, two)).resolves.toMatchObject({ gateway: "https://gw-s.example" });
    await expect(fetchRedstoneAt(2, [two[0]!])).rejects.toThrow(/public_gateway_rejected from https:\/\/gw-r.example, resting 30 s/);
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(Date.now() + REDSTONE_COOLDOWN_MS.max);
      await fetchRedstoneAt(3 + i, two);
    }
    await expect(fetchRedstoneAt(9, [two[0]!])).rejects.toThrow(/resting 120 s/);
    expect(asked.filter((h) => h === "gw-r.example")).toHaveLength(5);
  });
});
