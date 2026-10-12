// Ported from Owarine 90a91d71:web/src/components/icons/asset-marks/brand.test.ts (O-1, D-222)
import { readFileSync } from "node:fs";
import { TICKER_SYMBOLS, TICKERS } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { MARK_GLYPHS } from "./paths";

/** `--brand-<slug>: #RRGGBB;` as icons.css declares them; the registry (`Ticker.brand`) is the source (D-085). */
const css = readFileSync(new URL("../../../styles/icons.css", import.meta.url), "utf8");
const declared = new Map<string, string>([...css.matchAll(/--brand-([a-z]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1] ?? "", (m[2] ?? "").toUpperCase()]));
const registry = new Set<string>(TICKER_SYMBOLS.map((symbol) => TICKERS[symbol].brand.slug));

describe("icons.css mirrors Ticker.brand", () => {
  it.each(TICKER_SYMBOLS)("%s has its colour, its disc fill and a glyph", (symbol) => {
    const { slug, hex } = TICKERS[symbol].brand;
    expect(declared.get(slug)).toBe(hex.toUpperCase());
    expect(css).toContain(`.mark-${slug}-disc { fill: var(--brand-${slug}); }`);
    expect(MARK_GLYPHS[slug]).toBeDefined();
  });

  it("declares no brand the registry lacks", () => {
    expect([...declared.keys()].filter((slug) => !registry.has(slug))).toEqual([]);
  });
});
