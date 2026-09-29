// Ported from Agari 03b30ab:packages/core/src/market/void-reason.test.ts
import { describe, expect, it } from "vitest";
import { utc } from "./calendar.fixtures";
import { bpsPercent, VOID_HEADLINE, voidDetail, voidLines, voidReasonLine, type VoidInput } from "./void-reason";

/** `anchor/tests/events_halt_void.rs`: a RedStone Window `[T, T + 300]` at the archived 2026-09-11 16:00:00 ET tick. */
const T = 1_789_156_800;
const pythWindow: VoidInput = {
  voidReason: "missing-print",
  lane: "regular",
  primarySource: "redstone",
  tradingStartSec: T,
  lockAtSec: T + 300,
  expirySec: T + 300,
  openE8: 36_547_600_000n,
  closeE8: null,
};

describe("voidDetail", () => {
  it("names the empty close of the LiteSVM halt-void result (open recorded, close refused on confidence)", () => {
    const detail = voidDetail({ ...pythWindow, closeDeadlineSec: T + 1_200 });
    expect(detail).toEqual({ reason: "missing-print", slot: "close", source: "redstone", boundarySec: T + 300, deadlineSec: T + 1_200 });
    expect(voidLines(detail!)).toEqual([VOID_HEADLINE, "No signed RedStone price at 16:05:00 ET was recorded by 16:20:00 ET."]);
  });

  it("names the open first when both slots are empty (its deadline comes first), with the source default deadline", () => {
    const detail = voidDetail({ ...pythWindow, openE8: null });
    expect(detail).toMatchObject({ slot: "open", boundarySec: T, deadlineSec: T + 900 });
    expect(voidReasonLine(detail!)).toBe("No signed RedStone price at 16:00:00 ET was recorded by 16:15:00 ET.");
  });

  it("gives a Gap open until the Sunday lock and says so", () => {
    const gap: VoidInput = {
      ...pythWindow,
      lane: "gap",
      primarySource: "redstone",
      tradingStartSec: utc("2026-09-18T20:00:00Z"),
      lockAtSec: utc("2026-09-21T00:00:00Z"),
      expirySec: utc("2026-09-21T13:30:00Z"),
      openE8: null,
    };
    expect(voidReasonLine(voidDetail(gap)!)).toBe("No signed RedStone price at 16:00:00 ET was recorded by Sun 20:00:00 ET.");
    expect(voidReasonLine(voidDetail({ ...gap, openE8: 36_000_000_000n })!)).toBe("No signed RedStone price at 09:30:00 ET was recorded by 09:45:00 ET.");
  });

  it("gives a 24/7 Data Streams close its 900 s admission", () => {
    const token: VoidInput = { ...pythWindow, lane: "stock24", primarySource: "datastreams", tradingStartSec: utc("2026-09-19T14:00:00Z"), lockAtSec: utc("2026-09-19T14:05:00Z"), expirySec: utc("2026-09-19T14:05:00Z") };
    expect(voidReasonLine(voidDetail(token)!)).toBe("No signed Chainlink Data Streams price at 10:05:00 ET was recorded by 10:20:00 ET.");
  });

  it("leaves the slot unnamed when the prints weren't read, rather than guessing", () => {
    const detail = voidDetail({ ...pythWindow, openE8: undefined, closeE8: undefined });
    expect(detail).toEqual({ reason: "missing-print", slot: null, source: "redstone", boundarySec: null, deadlineSec: null });
    expect(voidReasonLine(detail!)).toBe("No signed RedStone price was recorded before its deadline.");
    expect(voidReasonLine({ ...detail!, source: "attested" })).toBe("No attested price was recorded before its deadline.");
    expect(voidDetail({ ...pythWindow, voidReason: null })).toBeNull();
  });

  it("finds the diverging pair at the band's edge: 25 bps settles, 25.01 bps voids", () => {
    const checked: VoidInput = {
      ...pythWindow,
      voidReason: "cross-check-divergence",
      checkSource: "redstone",
      openE8: 10_000_000_000n,
      checkOpenE8: 10_025_000_000n,
      closeE8: 10_100_000_000n,
      checkCloseE8: 10_125_260_000n,
    };
    const detail = voidDetail(checked);
    expect(detail).toEqual({ reason: "cross-check-divergence", slot: "close", source: "redstone", boundarySec: T + 300, deadlineSec: null });
    expect(voidReasonLine(detail!, { checkSource: "datastreams" })).toBe("RedStone and Chainlink Data Streams differed by more than 0.25% at 16:05:00 ET.");
    expect(voidDetail({ ...checked, checkOpenE8: 9_974_000_000n })?.slot).toBe("open");
    expect(voidReasonLine({ ...detail!, boundarySec: null })).toBe("The price and its cross-check differed by more than 0.25%.");
  });
});

it("keeps Masayume's void line verbatim and writes bps as percent", () => {
  expect(VOID_HEADLINE).toBe("Void — no reliable print, both sides pay 0.5");
  expect([25, 100, 150, 5, 1_000].map(bpsPercent)).toEqual(["0.25%", "1%", "1.5%", "0.05%", "10%"]);
});
