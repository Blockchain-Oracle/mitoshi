// Ported from Agari 03b30ab:packages/core/src/lifecycle/headroom.test.ts
import { describe, expect, it } from "vitest";
import { headroomSec, orderExpirySec } from "./headroom";

describe("headroomSec", () => {
  it("keeps a 30-second buffer for all supported cadences", () => {
    expect(headroomSec(60)).toBe(30);
    for (const interval of [300, 600, 900, 3600, 14400, 86400]) expect(headroomSec(interval)).toBe(30);
  });
});

describe("orderExpirySec", () => {
  const window = { lockAtSec: 10_000, intervalSec: 300 };

  it("is one headroom past now, never beyond the lock", () => {
    expect(orderExpirySec(9_000, window)).toBe(9_030);
    expect(orderExpirySec(9_969, window)).toBe(9_999);
  });

  it("is null inside the no-entry buffer", () => {
    expect(orderExpirySec(9_970, window)).toBeNull();
    expect(orderExpirySec(window.lockAtSec, window)).toBeNull();
  });

  it("closes a Gap Window at its Sunday lock, long before the Monday expiry", () => {
    const gap = { lockAtSec: 10_000, intervalSec: 604_800 };
    expect(orderExpirySec(9_990, gap)).toBeNull();
    expect(orderExpirySec(9_000, gap)).toBe(9_030);
  });
});
