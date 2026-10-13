/** D-230 item 1: a Window waiting for its opening print says when it opened, counts, and says why. */
import { describe, expect, it } from "vitest";
import { HERO, LANE_CARD } from "../copy";
import { bookNote, emptyBookWhy, openedAtText, openingWaitLine, openingWaitShort, splitCount } from "./opening-wait";

const at = () => "15:05:00";
const T = 1_791_904_500;

describe("the opening print's wait, in words", () => {
  it("counts down the relay's usual lag, then counts up how long it has waited", () => {
    expect(openingWaitLine({ startSec: T, nowSec: T + 2, prints: { openLagSec: 6, stall: null }, at })).toBe("Opened 15:05:00 · opening price in ~4s");
    expect(openingWaitLine({ startSec: T, nowSec: T + 3, prints: null, at })).toBe("Opened 15:05:00 · opening price in ~5s");
    expect(openingWaitLine({ startSec: T, nowSec: T + 42, prints: { openLagSec: 6, stall: null }, at })).toBe("Opened 15:05:00 · waiting 0:42 for the opening price");
  });

  it("says the open in a fixed 24-hour clock in every locale (en-US read \"04:05:00 PM\")", () => {
    const local = new Date(2026, 9, 13, 16, 5, 0).getTime() / 1000;
    expect(openedAtText(local)).toBe("16:05:00");
    expect(openedAtText(new Date(2026, 9, 13, 9, 7, 3).getTime() / 1000)).toBe("09:07:03");
    expect(openingWaitLine({ startSec: local, nowSec: local + 2, prints: { openLagSec: 6, stall: null } })).toBe("Opened 16:05:00 · opening price in ~4s");
  });

  it("says when the chain didn't answer the read, rather than that the print is late", () => {
    expect(openingWaitLine({ startSec: T, nowSec: T + 120, prints: null, unread: true, at })).toBe("Opened 15:05:00 · can't reach Tempo to read its opening price — retrying");
  });

  it("names a stall the relay reports for this Window's open, at once", () => {
    expect(openingWaitLine({ startSec: T, nowSec: T + 1, prints: { openLagSec: 6, stall: { sinceSec: T - 300, kind: "refused" } }, at })).toBe("Opened 15:05:00 · waiting 0:01 — RedStone is refusing requests");
    expect(openingWaitLine({ startSec: T, nowSec: T + 192, prints: { openLagSec: 6, stall: { sinceSec: T, kind: "unreachable" } }, at })).toBe("Opened 15:05:00 · waiting 3:12 — RedStone is unreachable");
    expect(openingWaitLine({ startSec: T, nowSec: T + 30, prints: { openLagSec: 6, stall: { sinceSec: T, kind: "unsigned" } }, at })).toBe("Opened 15:05:00 · waiting 0:30 for RedStone's opening price");
    // The print is in hand and Tempo's RPC keeps refusing the sends: Mitoshi's backlog, never blamed on RedStone.
    expect(openingWaitLine({ startSec: T, nowSec: T + 45, prints: { openLagSec: 6, stall: { sinceSec: T, kind: "sending" } }, at })).toBe("Opened 15:05:00 · waiting 0:45 — Tempo is busy, retrying");
    // A stall that began after this Window opened is not this Window's reason yet.
    expect(openingWaitLine({ startSec: T, nowSec: T + 2, prints: { openLagSec: 6, stall: { sinceSec: T + 60, kind: "refused" } }, at })).toBe("Opened 15:05:00 · opening price in ~4s");
  });
});

describe("an empty side of a trading book, in words", () => {
  const w = { tradingStartSec: T, lockAtSec: T + 300, expirySec: T + 300 };
  it("says the house is about to quote early, the next Window late, and plainly in between", () => {
    expect(emptyBookWhy(w, T + 20, at)).toEqual({ text: "No offers yet — the house quotes within seconds of the open", closing: false });
    expect(emptyBookWhy(w, T + 150, at).closing).toBe(false);
    expect(emptyBookWhy(w, T + 240, at)).toEqual({ text: "No offers left on this Window — the next opens 15:05:00", closing: true });
  });
});

describe("the wait, short", () => {
  it("on a lane card's strip: when it opened and a count, never a bare wait", () => {
    expect(openingWaitShort({ startSec: T, nowSec: T + 2, prints: { openLagSec: 6, stall: null }, at })).toBe("OPENED 15:05:00 · PRICE IN 4s");
    expect(openingWaitShort({ startSec: T, nowSec: T + 42, prints: null, at })).toBe("OPENED 15:05:00 · WAITING 0:42");
    expect(openingWaitShort({ startSec: T, nowSec: T + 2, prints: { openLagSec: 6, stall: { sinceSec: T, kind: "refused" } }, at })).toBe("OPENED 15:05:00 · WAITING 0:02");
    expect(LANE_CARD.pending.soon("x", "1s")).toBe("OPENED x · PRICE IN 1s");
  });

  it("under the hero's question, in the distance's place", () => {
    expect(openingWaitShort({ startSec: T, nowSec: T + 5, prints: null, at }, HERO.pendingDistance)).toBe("Opening price in ~3s");
    expect(openingWaitShort({ startSec: T, nowSec: T + 75, prints: null, at }, HERO.pendingDistance)).toBe("Waiting 1:15 for the opening price");
  });
});

describe("a live region's count", () => {
  it("splits the ticking count from the words, so a screen reader hears the words only", () => {
    expect(splitCount("Opened 15:05:00 · opening price in ~4s")).toEqual({ before: "Opened 15:05:00 · opening price in ", count: "~4s", after: "" });
    expect(splitCount("Opened 15:05:00 · waiting 0:42 — RedStone is refusing requests")).toEqual({ before: "Opened 15:05:00 · waiting ", count: "0:42", after: " — RedStone is refusing requests" });
    expect(splitCount("Opened 15:05:00 · can't reach Tempo to read its opening price — retrying")).toBeNull();
    expect(splitCount("No offers yet — the house quotes within seconds of the open")).toBeNull();
  });
});

describe("why the top of the book shows no price", () => {
  const w = { tradingStartSec: T, lockAtSec: T + 300, expirySec: T + 300 };
  it("says nothing before the first answer, that it can't read a failed one, and the book's own reason only when read", () => {
    expect(bookNote({ hydrating: true, failed: false }, w, T + 20)).toBeNull();
    expect(bookNote({ hydrating: false, failed: true }, w, T + 20)).toBe("Can't read the book right now — retrying");
    expect(bookNote({ hydrating: false, failed: false }, w, T + 20)).toBe("No offers yet — the house quotes within seconds of the open");
    expect(bookNote({ hydrating: false, failed: false }, w, T + 150)).toBe("No offers on this side right now");
  });
});
