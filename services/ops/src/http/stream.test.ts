import { describe, expect, it } from "vitest";
import { mintStreamTicket } from "@cwf/markets/stream-ticket";
import { createBus } from "../runtime/bus";
import { corsHeaders, grantTopics } from "./stream";

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
});
