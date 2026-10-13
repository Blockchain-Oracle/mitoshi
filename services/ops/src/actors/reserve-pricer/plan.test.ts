import { describe, expect, it } from "vitest";
import { plan } from "./index";

const BPH = 6_000n;

describe("reserve-pricer plan", () => {
  it("starts at the deploy block and steps an hour at a time", () => {
    const p = plan(null, 1_000n, 1_000_000n, BPH, 3);
    expect(p.blocks).toEqual([1_000n, 7_000n, 13_000n]);
    expect(p.backfilling).toBe(true);
  });

  it("resumes from the newest stored block", () => {
    expect(plan(13_000n, 1_000n, 1_000_000n, BPH, 2).blocks).toEqual([19_000n, 25_000n]);
  });

  it("stops the backfill within ten minutes of head, then takes one live sample at head", () => {
    const head = 100_000n;
    const p = plan(head - 6_500n, 1_000n, head, BPH);
    // next hourly block (head − 500) is inside the 10-minute gap: no backfill, the newest is old enough for a live one
    expect(p).toEqual({ blocks: [head], backfilling: false });
  });

  it("nothing to do while the newest sample is fresh", () => {
    expect(plan(99_500n, 1_000n, 100_000n, BPH)).toEqual({ blocks: [], backfilling: false });
  });

  it("the backfill reports done when the next hour would be live", () => {
    const p = plan(null, 90_000n, 100_000n, BPH, 12);
    expect(p.blocks).toEqual([90_000n, 96_000n]);
    expect(p.backfilling).toBe(false);
  });
});
