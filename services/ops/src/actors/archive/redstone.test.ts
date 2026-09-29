import { describe, expect, it } from "vitest";
import { boundaries, pick, STEP_SEC } from "./redstone";

const at = (iso: string) => Date.parse(iso) / 1000;

describe("archive boundaries", () => {
  it("includes every 5-minute boundary in (from, to]", () => {
    const from = at("2026-09-26T00:00:00Z"); // Saturday: no open grid
    const out = boundaries(from, from + 3600);
    expect(out).toHaveLength(12);
    expect(out[0]).toBe(from + STEP_SEC);
    expect(out.every((t) => t % STEP_SEC === 0)).toBe(true);
  });

  it("adds the 10 s grid around 09:30 New York time in summer (EDT = UTC-4)", () => {
    const open = at("2026-09-29T13:30:00Z");
    const out = boundaries(open - 120, open + 120);
    for (let t = open - 60; t <= open + 60; t += 10) expect(out).toContain(t);
    expect(out).not.toContain(open - 70);
  });

  it("follows the clock change in winter (EST = UTC-5)", () => {
    const open = at("2026-12-01T14:30:00Z");
    const out = boundaries(open - 120, open + 120);
    expect(out).toContain(open - 60);
    expect(out).toContain(open + 10);
    expect(out).not.toContain(at("2026-12-01T13:30:10Z"));
  });

  it("skips the open grid on weekends", () => {
    const sat = at("2026-10-03T13:30:00Z");
    expect(boundaries(sat - 120, sat + 120).filter((t) => t % STEP_SEC !== 0)).toEqual([]);
  });
});

describe("pick", () => {
  it("keeps only packages signed exactly at T and flags completeness", () => {
    const t = 1790651400;
    const pkg = (signer: string, ms: number, value = 1) => ({ timestampMilliseconds: ms, signerAddress: signer, dataPoints: [{ value }] });
    const three = ["a", "b", "c"].map((s) => pkg(s, t * 1000));
    const all: Record<string, ReturnType<typeof pkg>[]> = {};
    for (const id of ["TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "PLTR", "AMD", "BTC", "ETH", "SOL"]) all[id] = three;
    all.TSLA = [...three, pkg("d", (t + 300) * 1000)];
    const snap = pick(all, t);
    expect(snap.feeds.TSLA).toHaveLength(3);
    expect(snap.complete).toBe(true);
    all.SOL = three.slice(0, 2);
    expect(pick(all, t).complete).toBe(false);
  });
});
