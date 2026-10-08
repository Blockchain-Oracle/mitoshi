import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { mintStreamTicket } from "@cwf/markets/stream-ticket";
import { createBus } from "../runtime/bus";
import { readOpsEnv } from "../runtime/env";
import { corsHeaders, grantTopics, serveStream } from "./stream";

const A = "0x160a25fFFA76652Ba236CE97395B4d6C51bC3FC0";

describe("stream topics (D-049)", () => {
  it("open public and parameterised topics without a ticket", () => {
    expect(grantTopics(`prices,halts,market:0x${"ab".repeat(32)},symbol:TSLA`, null, null, 0)).toEqual({ topics: ["prices", "halts", `market:0x${"ab".repeat(32)}`, "symbol:TSLA"], error: null });
    expect(grantTopics("", null, null, 0).error).toBe("topics required");
    expect(grantTopics("nope", null, null, 0).error).toBe("unknown topic nope");
  });

  it("grant user:<address> only with that address's live ticket", () => {
    const { ticket } = mintStreamTicket("k", A, 100);
    expect(grantTopics(`user:${A}`, ticket, "k", 120)).toEqual({ topics: [`user:${A.toLowerCase()}`], error: null });
    expect(grantTopics(`user:0x${"11".repeat(20)}`, ticket, "k", 120).error).toMatch(/needs a valid ticket/);
    expect(grantTopics(`user:${A}`, ticket, "k", 200).error).toMatch(/needs a valid ticket/);
    expect(grantTopics(`user:${A}`, ticket, null, 120).error).toMatch(/not enabled/);
  });

  it("answer CORS for exact allowed origins only, never with credentials", () => {
    const allowed = ["https://testnet.mitoshi.xyz"];
    expect(corsHeaders("https://testnet.mitoshi.xyz", allowed)["access-control-allow-origin"]).toBe("https://testnet.mitoshi.xyz");
    expect(corsHeaders("https://evil.example", allowed)["access-control-allow-origin"]).toBeUndefined();
    expect(Object.keys(corsHeaders("https://testnet.mitoshi.xyz", allowed))).not.toContain("access-control-allow-credentials");
  });
});

describe("bus resume (Last-Event-ID)", () => {
  it("replays only newer events on the wanted topics, and refuses an id from another epoch or out of the ring", () => {
    const bus = createBus(3, "e1");
    const a = bus.publish("prices", "price", 1);
    bus.publish("halts", "halts", {});
    bus.publish("prices", "price", 2);
    expect(bus.since(a.id, (t) => t === "prices")!.map((e) => e.data)).toEqual([2]);
    expect(bus.since("e0-1", () => true)).toBeNull();
    bus.publish("prices", "price", 3);
    bus.publish("prices", "price", 4);
    expect(bus.since(a.id, () => true)).toBeNull();
  });

  it("allow the web origins by default: the testnet app and localhost dev on testnet, the apex on mainnet", () => {
    const testnet = readOpsEnv({ NETWORK: "testnet" }).corsOrigins;
    expect(testnet).toEqual(["https://testnet.mitoshi.xyz", "http://localhost:3000"]);
    for (const origin of testnet) expect(corsHeaders(origin, testnet)["access-control-allow-origin"]).toBe(origin);
    expect(readOpsEnv({ NETWORK: "mainnet" }).corsOrigins).toEqual(["https://mitoshi.xyz", "https://www.mitoshi.xyz"]);
    expect(readOpsEnv({ NETWORK: "testnet", OPS_CORS_ORIGINS: "https://a.example, https://b.example" }).corsOrigins).toEqual(["https://a.example", "https://b.example"]);
  });
});

describe("the ephemeral ticks topic (S23a)", () => {
  /** A request/response pair that records what the stream writes. */
  const pair = (url: string, lastEventId?: string) => {
    const out: string[] = [];
    let onClose = () => undefined as void;
    const req = { url, headers: lastEventId ? { "last-event-id": lastEventId } : {}, on: (_: string, fn: () => void) => void (onClose = fn) } as unknown as IncomingMessage;
    const res = { writeHead: () => res, write: (c: string) => (out.push(c), true), end: () => undefined } as unknown as ServerResponse;
    return { req, res, out, close: () => onClose() };
  };

  it("is granted without a ticket, never enters the replay ring, and opens on its snapshot even when resuming", async () => {
    expect(grantTopics("ticks,prices", null, null, 0)).toEqual({ topics: ["ticks", "prices"], error: null });
    const bus = createBus(10, "e1");
    const first = bus.publish("prices", "price", 1);
    bus.emit("ticks", "tick", { symbol: "BTC", priceE8: "6200000000000" });
    bus.publish("prices", "price", 2);
    expect(bus.since(first.id, () => true)!.map((e) => e.topic)).toEqual(["prices"]);

    const snapshot = async (topic: string) => (topic === "ticks" ? [{ event: "tick", data: { symbol: "BTC", priceE8: "6200100000000" } }] : [{ event: "price", data: "snap" }]);
    const resumed = pair("/v1/stream?topics=ticks,prices", first.id);
    await serveStream(resumed.req, resumed.res, { bus, snapshot, secret: null, cors: {} });
    const text = resumed.out.join("");
    expect(text).toContain('"data":2'); // replayed from the ring
    expect(text).toContain("6200100000000"); // the ticks snapshot, though resuming
    expect(text).not.toContain('"snap"'); // a ring topic is not re-snapshotted on resume

    bus.emit("ticks", "tick", { symbol: "ETH", priceE8: "250000000000" });
    const live = resumed.out.at(-1)!;
    expect(live).toContain("250000000000");
    expect(live.startsWith("id:")).toBe(false); // no id: the client's Last-Event-ID stays on the ring
    resumed.close();
  });
});
