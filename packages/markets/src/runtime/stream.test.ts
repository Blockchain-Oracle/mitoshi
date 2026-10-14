import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createSseParser } from "./sse";
import { createStreamClient, type StreamEvent } from "./stream";
import { configureStream, resetStreamMemory, subscribeTopic } from "./stream-hub";

/** A real SSE server with the ops wire format: records each request, lets a test push frames or drop connections. */
function sseServer(refuse: (url: URL) => boolean = () => false) {
  const requests: URL[] = [];
  const open = new Set<ServerResponse>();
  let seq = 0;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://x");
    requests.push(url);
    if ((url.searchParams.get("topics")?.includes("user:") && !url.searchParams.get("ticket")) || refuse(url)) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("retry: 50\n\n");
    open.add(res);
    req.on("close", () => open.delete(res));
  });
  return {
    requests,
    open,
    listen: () => new Promise<string>((ok) => server.listen(0, () => ok(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    send(topic: string, event: string, data: unknown) {
      seq += 1;
      for (const r of open) r.write(`id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify({ topic, data })}\n\n: ping\n\n`);
    },
    dropAll() {
      for (const r of open) r.destroy();
    },
    close: () => new Promise<void>((ok) => { server.closeAllConnections(); server.close(() => ok()); }),
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, ms = 3_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(10);
  }
}

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanup.splice(0)) await c();
});

describe("SSE parser", () => {
  it("parses ids, events, multi-line data, comments and retry across arbitrary chunk splits", () => {
    const got: unknown[] = [];
    let retry = 0;
    const p = createSseParser((m) => got.push(m), (ms) => (retry = ms));
    const text = "retry: 2500\r\n: ping\nid: 7\nevent: price\ndata: {\"a\":\ndata: 1}\n\ndata: plain\n\n";
    for (const ch of text) p.push(ch);
    expect(retry).toBe(2500);
    expect(got).toEqual([{ id: "7", event: "price", data: "{\"a\":\n1}" }, { id: "7", event: "message", data: "plain" }]);
    expect(p.lastEventId()).toBe("7");
  });
});

describe("stream client (one connection, real HTTP)", () => {
  it("shares one connection, batches per frame, and resumes from the last id when the topic set changes", async () => {
    const srv = sseServer();
    const url = await srv.listen();
    cleanup.push(srv.close);
    const batches: StreamEvent[][] = [];
    const client = createStreamClient({ url, onBatch: (b) => batches.push(b), visibility: null, debounceMs: 5 });
    cleanup.push(async () => client.close());
    const offA = client.subscribe("prices");
    const offB = client.subscribe("prices");
    await until(() => srv.open.size === 1);
    srv.send("prices", "price", { symbol: "BTC", priceE8: "6400000000000" });
    srv.send("prices", "price", { symbol: "ETH", priceE8: "320000000000" });
    await until(() => batches.flat().length === 2);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.map((e) => (e.data as { symbol: string }).symbol)).toEqual(["BTC", "ETH"]);
    expect(srv.requests).toHaveLength(1);

    client.subscribe("halts");
    await until(() => srv.requests.length === 2 && srv.open.size === 1);
    const second = srv.requests[1]!;
    expect(second.searchParams.get("topics")).toBe("halts,prices");
    expect(second.searchParams.get("lastEventId")).toBe("2");
    offA();
    offB();
    await until(() => srv.requests.length === 3);
    expect(srv.requests[2]!.searchParams.get("topics")).toBe("halts");
  });

  it("pauses while hidden and resumes with replay when shown", async () => {
    const srv = sseServer();
    const url = await srv.listen();
    cleanup.push(srv.close);
    let hidden = false;
    const listeners = new Set<() => void>();
    const visibility = { hidden: () => hidden, subscribe: (f: () => void) => (listeners.add(f), () => listeners.delete(f)) };
    const states: string[] = [];
    const client = createStreamClient({ url, onBatch: () => undefined, onState: (s) => states.push(s), visibility, debounceMs: 5 });
    cleanup.push(async () => client.close());
    client.subscribe("prices");
    await until(() => srv.open.size === 1);
    srv.send("prices", "price", { symbol: "SOL" });
    await wait(50);
    hidden = true;
    for (const f of listeners) f();
    await until(() => srv.open.size === 0);
    expect(client.state()).toBe("paused");
    hidden = false;
    for (const f of listeners) f();
    await until(() => srv.open.size === 1);
    expect(srv.requests.at(-1)!.searchParams.get("lastEventId")).toBe("1");
    expect(states).toContain("paused");
  });

  it("asks for a ticket for per-user topics, drops them when signed out, and backs off after a drop", async () => {
    const srv = sseServer();
    const url = await srv.listen();
    cleanup.push(srv.close);
    let ticket: string | null = null;
    const grants: boolean[] = [];
    const client = createStreamClient({ url, onBatch: () => undefined, visibility: null, debounceMs: 5, ticket: async () => ticket, onUserGrant: (g) => grants.push(g) });
    cleanup.push(async () => client.close());
    client.subscribe("prices");
    client.subscribe("user:0x00000000000000000000000000000000000000a1");
    await until(() => srv.open.size === 1);
    expect(srv.requests[0]!.searchParams.get("topics")).toBe("prices");
    // No ticket: the caller hears it, so it can follow the user's events on the chain instead (D-151).
    expect(grants).toEqual([false]);
    ticket = "0xabc.1.def";
    srv.dropAll();
    await until(() => srv.requests.length >= 2 && srv.open.size === 1);
    const again = srv.requests.at(-1)!;
    expect(again.searchParams.get("topics")).toBe("prices,user:0x00000000000000000000000000000000000000a1");
    expect(again.searchParams.get("ticket")).toBe("0xabc.1.def");
    expect(grants).toEqual([false, true]);
  });

  it("keeps the public topics flowing when the stream refuses the ticket — and asks for the user topic later", async () => {
    // 2026-10-09: web and ops held different ticket secrets; every signed-in page retried the same 401 and got nothing.
    const srv = sseServer((u) => u.searchParams.get("ticket") === "forged");
    const url = await srv.listen();
    cleanup.push(srv.close);
    const grants: boolean[] = [];
    const client = createStreamClient({ url, onBatch: () => undefined, visibility: null, debounceMs: 5, ticket: async () => "forged", onUserGrant: (g) => grants.push(g) });
    cleanup.push(async () => client.close());
    client.subscribe("prices");
    client.subscribe("user:0x00000000000000000000000000000000000000a1");
    await until(() => srv.open.size === 1 && client.state() === "open");
    expect(srv.requests[0]!.searchParams.get("ticket")).toBe("forged");
    expect(srv.requests.at(-1)!.searchParams.get("topics")).toBe("prices");
    expect(srv.requests.at(-1)!.searchParams.get("ticket")).toBeNull();
    expect(client.state()).toBe("open");
    expect(grants).toEqual([true, false, false]);
  });
});

describe("stream hub (late subscribers)", () => {
  it("hands a listener that joins an open price topic each symbol's latest event at once, and never replays other topics", async () => {
    const srv = sseServer();
    const url = await srv.listen();
    cleanup.push(srv.close, async () => {
      configureStream({ url: null });
      resetStreamMemory();
    });
    configureStream({ url });
    const first: StreamEvent[] = [];
    const offFirst = subscribeTopic("prices", (e) => first.push(...e));
    const fills: StreamEvent[] = [];
    const offFills = subscribeTopic("market:0xabc", (e) => fills.push(...e));
    await until(() => srv.open.size > 0);
    srv.send("prices", "price", { symbol: "BTC", priceE8: "8000000000000", publishTimeSec: 1, source: "redstone", signers: 5 });
    srv.send("prices", "price", { symbol: "BTC", priceE8: "8100000000000", publishTimeSec: 2, source: "redstone", signers: 5 });
    srv.send("market:0xabc", "fill", { maker: "0x1" });
    await until(() => first.length === 2 && fills.length === 1);

    // The price cache mounting after the ticker: the connection already carries `prices`, so no new snapshot comes.
    const late: StreamEvent[] = [];
    const offLate = subscribeTopic("prices", (e) => late.push(...e));
    await until(() => late.length > 0, 500);
    expect(late).toHaveLength(1);
    expect((late[0]!.data as { priceE8: string }).priceE8).toBe("8100000000000");

    const lateFills: StreamEvent[] = [];
    const offLateFills = subscribeTopic("market:0xabc", (e) => lateFills.push(...e));
    await wait(50);
    expect(lateFills).toHaveLength(0);
    offFirst();
    offFills();
    offLate();
    offLateFills();
  });
});
