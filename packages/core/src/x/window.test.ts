// Ported from Masayume 68f7a09:packages/core/src/x/window.test.ts — plus the stock lane rule (S11, D-227).
import { describe, expect, it } from "vitest";
import type { EventMarket } from "../types";
import { selectXWindow, xCallExpired, xLanesOf } from "./window";

const at = (minute: number, second = 0) => Date.UTC(2026, 9, 13, 8, minute, second);
const market = (over: Partial<EventMarket> & { onchainStatus?: number } = {}) => ({ asset: "BTC", lane: "crypto24", intervalSec: 300,
  tradingStartSec: at(20) / 1000, lockAtSec: at(25) / 1000, expirySec: at(25) / 1000, openingPriceRaw: 1n,
  state: "open", status: "Trading", ...over }) as EventMarket;
const call = { asset: "BTC" as const, intervalSec: 300 };

describe("X Window matching", () => {
  it("admits a call inside the 30-second buffer and refuses at it", () => {
    expect(selectXWindow([market()], call, at(24, 29)).ok).toBe(true);
    expect(selectXWindow([market()], call, at(24, 30))).toMatchObject({ ok: false, code: "window-entry-closed" });
  });
  it("names a pending opening price and a future start apart", () => {
    expect(selectXWindow([market({ openingPriceRaw: null })], call, at(21))).toMatchObject({ ok: false, code: "opening-price-pending" });
    expect(selectXWindow([market()], call, at(19))).toMatchObject({ ok: false, code: "window-not-started" });
  });
  it("never substitutes another asset or cadence", () => {
    for (const row of [market({ asset: "ETH" }), market({ intervalSec: 900 })]) expect(selectXWindow([row], call, at(21))).toEqual({ ok: false, code: "no-window" });
  });
  it("takes a stock on its 24/7 lane, else on Regular; never on crypto24 or Gap", () => {
    const tsla = { asset: "TSLA" as const, intervalSec: 300 };
    const regular = market({ asset: "TSLA", lane: "regular", expirySec: at(25) / 1000 });
    const allDay = market({ asset: "TSLA", lane: "stock24", expirySec: at(25) / 1000 });
    expect(selectXWindow([regular, allDay], tsla, at(21))).toMatchObject({ ok: true, market: { lane: "stock24" } });
    expect(selectXWindow([regular], tsla, at(21))).toMatchObject({ ok: true, market: { lane: "regular" } });
    expect(selectXWindow([market({ asset: "TSLA", lane: "gap" })], tsla, at(21))).toEqual({ ok: false, code: "no-window" });
    expect(xLanesOf("BTC")).toEqual(["crypto24"]);
  });

  it("calls a call too late once one cadence has passed since it was posted", () => {
    expect(xCallExpired(at(20), 300, at(25))).toBe(false);
    expect(xCallExpired(at(20), 300, at(25, 1))).toBe(true);
    expect(xCallExpired(at(20), 3_600, at(50))).toBe(false);
  });
});
