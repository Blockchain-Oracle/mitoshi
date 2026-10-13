/**
 * D-230: a stall is said with its kind — RedStone's (no packages for T) or Tempo's (the print is in hand and the RPC
 * refuses the sends, never blamed on RedStone) — and while stalled the relay paces itself instead of re-reading every
 * Window every 1.5 s on the shared RPC budget.
 */
import { describe, expect, it } from "vitest";
import { relayDelayMs, STALL_AFTER_SEC, STALLED_PASS_MS, stallOf, type RelayStall } from "./pass";
import type { PrintSlot } from "./slots";

const T = 1_791_909_000;
const slot = (boundarySec: number, id = "0x01"): PrintSlot => ({ boundarySec, slot: "open", market: { marketId: id } } as unknown as PrintSlot);
const ctx = (stall: RelayStall | null = null, sourceError: string | null = null, sendError = "HTTP 429 rate limited, try again in 300ms") => ({
  stall,
  proofs: { cache: { error: () => sourceError } } as never,
  failures: new Map([["0x01:open", { attempts: 0, reason: sendError }]]),
});

describe("the relay's stall, by kind", () => {
  it("is nothing while due prints are inside their first 20 s", () => {
    expect(stallOf(ctx(), [slot(T)], [slot(T)], T + STALL_AFTER_SEC - 1)).toBeNull();
  });

  it("names the price network when a print has no source data", () => {
    const s = stallOf(ctx(null, "RedStone gateways failed (HTTP 403 public_gateway_rejected from https://oracle-gateway-1.a.redstone.finance)"), [slot(T)], [], T + 25);
    expect(s).toEqual({ sinceSec: T, kind: "source", reason: "RedStone gateways failed (HTTP 403 public_gateway_rejected from https://oracle-gateway-1.a.redstone.finance)" });
    expect(stallOf(ctx(), [slot(T)], [], T + 25)?.reason).toBe("the price network has not signed it yet");
  });

  it("names Tempo's RPC when the print is in hand and its sends keep failing — not RedStone", () => {
    const s = stallOf(ctx(), [], [slot(T)], T + 40);
    expect(s?.kind).toBe("sending");
    expect(s?.reason).toMatch(/^Tempo's RPC refuses the sends: HTTP 429/);
  });

  it("keeps the first T of a stall of the same kind, and starts over when the kind changes", () => {
    const was: RelayStall = { sinceSec: T - 300, kind: "source", reason: "x" };
    expect(stallOf(ctx(was), [slot(T)], [], T + 25)?.sinceSec).toBe(T - 300);
    expect(stallOf(ctx(was), [], [slot(T)], T + 25)?.sinceSec).toBe(T);
  });
});

describe("the relay's pace", () => {
  const base = { nowSec: T + 30, nextSec: T + 30 + 15, coolUntilMs: null, nowMs: (T + 30) * 1000 };
  const source: RelayStall = { sinceSec: T, kind: "source", reason: "refused" };
  it("asks again at once after a landing, every 1.5 s inside RedStone's usual few seconds", () => {
    expect(relayDelayMs({ ...base, sent: 3, waiting: 0, stall: source })).toBe(500);
    expect(relayDelayMs({ ...base, sent: 0, waiting: 4, stall: null })).toBe(1_500);
  });

  it("stalled, waits 5 s — or to the end of the gateways' rest — but never past the next boundary's first ask", () => {
    expect(relayDelayMs({ ...base, sent: 0, waiting: 4, stall: source })).toBe(STALLED_PASS_MS);
    expect(relayDelayMs({ ...base, sent: 0, waiting: 4, stall: source, coolUntilMs: base.nowMs + 12_000 })).toBe(12_000);
    expect(relayDelayMs({ ...base, sent: 0, waiting: 4, stall: source, coolUntilMs: base.nowMs + 90_000 })).toBe(15_000);
    expect(relayDelayMs({ ...base, sent: 0, waiting: 4, stall: source, coolUntilMs: base.nowMs + 90_000, nextSec: base.nowSec })).toBe(3_000);
    // A send stall doesn't wait on RedStone's rest: its pacing is the RPC budget's.
    expect(relayDelayMs({ ...base, sent: 0, waiting: 4, stall: { ...source, kind: "sending" }, coolUntilMs: base.nowMs + 90_000 })).toBe(STALLED_PASS_MS);
  });

  it("idle, comes back for the next boundary's first ask", () => {
    expect(relayDelayMs({ ...base, sent: 0, waiting: 0, stall: null, nextSec: base.nowSec + 4 })).toBe(7_000);
    expect(relayDelayMs({ ...base, sent: 0, waiting: 0, stall: null, nextSec: base.nowSec + 100 })).toBe(15_000);
  });
});
