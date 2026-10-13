import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderTokensCss } from "./css";
import { OUT } from "./generate-path";
import { nativeTheme, tokens } from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const yosuku = (part: string) => readFileSync(resolve(here, `../../../web/src/styles/yosuku/${part}.css`), "utf8");
const fixture = readFileSync(resolve(here, "masayume-bridge.fixture.css"), "utf8");

/** `--name: value;` pairs of the first block opened by `selector` in a stylesheet. */
function varsOf(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.replace(/\/\*.*?\*\//g, "").trim()]));
}

describe("tokens.json matches the ported Masayume styles (plan §2.2 check)", () => {
  it("dark palette = yosuku part-01 :root", () => {
    const root = varsOf(yosuku("part-01"), ":root");
    for (const [k, v] of Object.entries(tokens.palette.dark)) expect(root[k]?.toUpperCase(), k).toBe(v.toUpperCase());
  });

  it("light palette = yosuku part-13 [data-theme=light]", () => {
    const light = varsOf(yosuku("part-13"), '[data-theme="light"]');
    for (const [k, v] of Object.entries(tokens.palette.light)) expect(light[k]?.toUpperCase(), k).toBe(v.toUpperCase());
  });

  it("surfaces, shared colours, type, radii and spacing = Masayume's bridge", () => {
    const dark = varsOf(fixture, ":root");
    const light = varsOf(fixture, '[data-theme="light"]');
    for (const [k, v] of Object.entries(tokens.surfaces.dark)) expect(dark[`ms-${k}`], k).toBe(v);
    for (const [k, v] of Object.entries(tokens.surfaces.light)) expect(light[`ms-${k}`], k).toBe(v);
    const theme = varsOf(fixture, "@theme");
    for (const [k, v] of Object.entries(tokens.shared)) expect(theme[`color-${k}`]?.toUpperCase(), k).toBe(v.toUpperCase());
    // The ladder R6 added (S14) has no Masayume counterpart; every size the bridge had still matches it.
    for (const [name, t] of Object.entries(tokens.type)) if (theme[`text-${name}`] !== undefined) expect(theme[`text-${name}`], name).toBe((t as { size: string }).size);
    for (const [k, v] of Object.entries(tokens.radius)) expect(theme[`radius-${k}`], k).toBe(v);
    expect(theme.spacing).toBe(tokens.spacing.base);
  });

  it("no type size sits under the 11 px floor (R6 S14)", () => {
    for (const [name, t] of Object.entries(tokens.type)) {
      if (name.startsWith("$")) continue;
      const px = [...(t as { size: string }).size.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      for (const v of px) expect(v, name).toBeGreaterThanOrEqual(11);
    }
  });

  it("the generated stylesheet is current", () => {
    expect(readFileSync(OUT, "utf8")).toBe(renderTokensCss());
  });

  it("gives the native theme every semantic colour, trading tokens included", () => {
    const n = nativeTheme("light");
    expect(n.accent).toBe("#D93E1F");
    expect(n.up).toBe(tokens.palette.light.profit);
    expect(n["surface-1"]).toBe("#F6F0E4");
  });
});
