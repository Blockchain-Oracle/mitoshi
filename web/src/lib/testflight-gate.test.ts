// The TestFlight gate (D-230): Apple's join page is read off the request path, a failure costs one read and a retry
// later (never every request), the last verified answer stands through failures, and an unverified link is never open.
import { describe, expect, it } from "vitest";
import { createTestflightGate, readTestflight } from "./testflight-gate";

const LINK = "https://testflight.apple.com/join/AbC123xy";
const OPEN_PAGE = `<div class="beta-status"><span>Join the Mitoshi beta</span></div><a href="itms-beta://testflight.apple.com/join/AbC123xy">`;
const CLOSED_PAGE = `<div class="beta-status"><span>This beta isn&#39;t accepting any new testers right now.</span></div><a href="itms-beta://testflight.apple.com/join/AbC123xy">`;

type Reply = string | Error | "hang";

/** A fetch that answers from a script, counts its calls, and honours the abort signal like the real one. */
function scripted(replies: Reply[], delayMs = 0) {
  const calls: string[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    const reply = replies.shift() ?? "hang";
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      if (reply === "hang") return;
      setTimeout(() => (reply instanceof Error ? reject(reply) : resolve(new Response(reply, { status: 200 }))), delayMs);
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("readTestflight", () => {
  it("reads open and closed pages, and says why a read failed without throwing", async () => {
    expect(await readTestflight(LINK, scripted([OPEN_PAGE]).fetchImpl, 1_000)).toEqual({ state: "open" });
    expect(await readTestflight(LINK, scripted([CLOSED_PAGE]).fetchImpl, 1_000)).toEqual({ state: "closed" });
    expect(await readTestflight(LINK, scripted([new TypeError("fetch failed")]).fetchImpl, 1_000)).toEqual({ state: "unknown", why: "no connection" });
    expect(await readTestflight(LINK, scripted(["hang"]).fetchImpl, 20)).toEqual({ state: "unknown", why: "no answer in 20 ms" });
    expect(await readTestflight(LINK, (async () => new Response("busy", { status: 503 })) as typeof fetch, 1_000)).toEqual({ state: "unknown", why: "status 503" });
  });
});

describe("createTestflightGate", () => {
  it("waits for the first read of a process, then answers from memory until the answer is stale", async () => {
    const { fetchImpl, calls } = scripted([CLOSED_PAGE, OPEN_PAGE]);
    const c = clock();
    const lines: string[] = [];
    const gate = createTestflightGate({ fetch: fetchImpl, now: c.now, freshMs: 300_000, log: (l) => lines.push(l) });
    expect(await gate.state(LINK)).toBe("closed");
    c.advance(299_000);
    expect(await gate.state(LINK)).toBe("closed");
    expect(calls).toHaveLength(1);
    // Stale: the old answer now, the new one read in the background.
    c.advance(2_000);
    expect(await gate.state(LINK)).toBe("closed");
    await gate.settled();
    expect(await gate.state(LINK)).toBe("open");
    expect(calls).toHaveLength(2);
    expect(lines).toEqual(["TestFlight join page: closed", "TestFlight join page: open"]);
  });

  it("never holds the first request past its cold wait: unknown, and the read lands for the next", async () => {
    const { fetchImpl } = scripted([OPEN_PAGE], 80);
    const gate = createTestflightGate({ fetch: fetchImpl, coldWaitMs: 10 });
    const started = Date.now();
    expect(await gate.state(LINK)).toBe("unknown");
    expect(Date.now() - started).toBeLessThan(60);
    await gate.settled();
    expect(await gate.state(LINK)).toBe("open");
  });

  it("costs a failure one read: requests answer at once until the retry, and the link is not offered", async () => {
    const { fetchImpl, calls } = scripted(["hang", "hang", OPEN_PAGE]);
    const c = clock();
    const lines: string[] = [];
    const gate = createTestflightGate({ fetch: fetchImpl, now: c.now, timeoutMs: 20, retryMs: 30_000, coldWaitMs: 1_000, log: (l) => lines.push(l) });
    expect(await gate.state(LINK)).toBe("unknown");
    for (let i = 0; i < 20; i++) {
      const started = Date.now();
      expect(await gate.state(LINK)).toBe("unknown");
      expect(Date.now() - started).toBeLessThan(15);
    }
    expect(calls).toHaveLength(1);
    c.advance(30_000);
    expect(await gate.state(LINK)).toBe("unknown");
    await gate.settled();
    expect(calls).toHaveLength(2);
    c.advance(30_000);
    await gate.state(LINK);
    await gate.settled();
    expect(await gate.state(LINK)).toBe("open");
    expect(lines).toEqual([
      "TestFlight join page unread (no answer in 20 ms); not offering the link",
      "TestFlight join page unread (no answer in 20 ms); not offering the link",
      "TestFlight join page: open",
    ]);
  });

  it("keeps the last verified answer through failed reads, for at most keepMs", async () => {
    const { fetchImpl, calls } = scripted([OPEN_PAGE, new TypeError("fetch failed"), new TypeError("fetch failed")]);
    const c = clock();
    const lines: string[] = [];
    const gate = createTestflightGate({ fetch: fetchImpl, now: c.now, freshMs: 300_000, retryMs: 30_000, keepMs: 3_600_000, log: (l) => lines.push(l) });
    expect(await gate.state(LINK)).toBe("open");
    c.advance(300_000);
    expect(await gate.state(LINK)).toBe("open");
    await gate.settled();
    expect(await gate.state(LINK)).toBe("open");
    expect(lines.at(-1)).toBe('TestFlight join page unread (no connection); keeping "open"');
    c.advance(3_300_000);
    expect(await gate.state(LINK)).toBe("unknown");
    await gate.settled();
    expect(calls).toHaveLength(3);
  });

  it("shares one read among the requests that arrive while it runs", async () => {
    const { fetchImpl, calls } = scripted([OPEN_PAGE], 20);
    const gate = createTestflightGate({ fetch: fetchImpl });
    expect(await Promise.all([gate.state(LINK), gate.state(LINK), gate.state(LINK)])).toEqual(["open", "open", "open"]);
    expect(calls).toHaveLength(1);
  });
});
