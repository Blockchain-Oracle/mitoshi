import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// next/font's own fallback computation (the numbers it writes into its `local(Arial)` rules).
const require = createRequire(import.meta.url);
const { getFallbackFontOverrideMetrics } = require("next/dist/compiled/@next/font/dist/google/get-fallback-font-override-metrics.js") as {
  getFallbackFontOverrideMetrics: (family: string) => { fallbackFont: string; ascentOverride: string; descentOverride: string; lineGapOverride: string; sizeAdjust: string };
};

const css = readFileSync(new URL("./font-fallbacks.css", import.meta.url), "utf8");
const rules = new Map(
  [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const get = (name: string) => body!.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim() ?? "";
    return [get("font-family").replaceAll('"', ""), { src: get("src"), ascent: get("ascent-override"), descent: get("descent-override"), lineGap: get("line-gap-override"), size: get("size-adjust") }] as const;
  }),
);
const pct = (v: string) => Number.parseFloat(v);
const metrics = require("next/dist/server/capsize-font-metrics.json") as Record<string, { unitsPerEm: number; xWidthAvg: number; ascent: number; descent: number; lineGap: number }>;

describe("font fallbacks (D-182)", () => {
  for (const family of ["Sora", "Inter"]) {
    it(`${family}: next/font's overrides, on Arial and its metric twins`, () => {
      const rule = rules.get(`${family} Fallback`);
      const next = getFallbackFontOverrideMetrics(family);
      expect(rule).toBeDefined();
      expect(next.fallbackFont).toBe("Arial");
      expect(pct(rule!.ascent)).toBe(pct(next.ascentOverride));
      expect(pct(rule!.descent)).toBe(pct(next.descentOverride));
      expect(pct(rule!.lineGap)).toBe(pct(next.lineGapOverride));
      expect(pct(rule!.size)).toBe(pct(next.sizeAdjust));
      // Arial first (a superset of next/font's rule), then the platforms that lack it.
      expect(rule!.src.startsWith('local("Arial")')).toBe(true);
      for (const face of ["Liberation Sans", "Arimo", "Roboto"]) expect(rule!.src).toContain(`local("${face}")`);
    });
  }

  it("JetBrains Mono: a monospace face sized and boxed as JetBrains Mono", () => {
    const rule = rules.get("JetBrains Mono Fallback")!;
    const jbm = metrics.jetBrainsMono!;
    const courier = metrics.courierNew!;
    // Every candidate advances ~0.600 em (Courier New's class; DejaVu Sans Mono and Menlo 0.602): size-adjust ≈ 100 %.
    const size = (jbm.xWidthAvg / jbm.unitsPerEm / (courier.xWidthAvg / courier.unitsPerEm)) * 100;
    expect(Math.abs(pct(rule.size) - size)).toBeLessThan(0.5);
    expect(pct(rule.ascent)).toBeCloseTo((jbm.ascent / jbm.unitsPerEm) * 100, 2);
    expect(pct(rule.descent)).toBeCloseTo((-jbm.descent / jbm.unitsPerEm) * 100, 2);
    expect(pct(rule.lineGap)).toBe(0);
    for (const face of ["Menlo", "DejaVu Sans Mono", "Liberation Mono", "Droid Sans Mono", "Courier New"]) expect(rule.src).toContain(`local("${face}")`);
    expect(rule.src).not.toContain("Arial");
  });
});
