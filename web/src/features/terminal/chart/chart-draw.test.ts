// R4-0 (D-227): an off-screen level's tag pins clear of what floats over the canvas (the terminal's header on a phone).
import { describe, expect, it } from "vitest";
import { clearRow, drawLevel } from "./chart-draw";
import { NO_PINS, PAD_Y, TAG_H, type ChartLevel, type ChartTheme } from "./chart-style";
import type { YWindow } from "./engine";

const theme = { up: "green", down: "red", ink: "white", inverse: "black", helper: "gray", warn: "orange", signed: "orangered", darkText: "black", lightText: "white", axisFont: "", pillFont: "", pillPriceFont: "", pillPnlFont: "", tagFont: "", tagStrongFont: "", markFont: "" } as ChartTheme;

/** A canvas context that records the tags it is asked to draw (their y and text); every other call is a no-op. */
function recorder() {
  const tags: { y: number; text: string }[] = [];
  let lastY = 0;
  const ctx = {
    font: "", fillStyle: "black", strokeStyle: "", globalAlpha: 1, lineWidth: 1, textAlign: "left", textBaseline: "middle",
    measureText: (t: string) => ({ width: t.length * 6 }),
    beginPath() {}, fill() {}, save() {}, restore() {}, setLineDash() {}, moveTo() {}, lineTo() {}, stroke() {},
    roundRect: (_x: number, y: number) => void (lastY = y),
    fillText: (text: string) => void tags.push({ y: lastY, text }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, tags };
}

// A 300 px canvas: the plot runs from PAD_Y to 300 − PAD_Y; $82,450…$82,550 fill it.
const H = 300;
const win: YWindow = { center: 82_500, half: 50, top: PAD_Y, bottom: H - PAD_Y };
const line = (price: number): ChartLevel => ({ kind: "line", price, label: "Line" });

describe("drawLevel pins", () => {
  it("with no pins, an off-screen level pins 9 px inside the edge, as Owarine's", () => {
    const up = recorder();
    drawLevel(up.ctx, theme, line(82_600), win, 200, 320, theme.up);
    expect(up.tags).toEqual([{ y: 9, text: "▲ Line $82,600.00" }]);
    const down = recorder();
    drawLevel(down.ctx, theme, line(82_400), win, 200, 320, theme.up);
    expect(down.tags[0]!.y).toBe(H - 9 - TAG_H);
  });

  it("an off-screen level's tag sits below the header and above the controls", () => {
    const up = recorder();
    drawLevel(up.ctx, theme, line(82_600), win, 200, 320, theme.up, { top: 114, bottom: 52 });
    expect(up.tags[0]!.y).toBe(120);
    const down = recorder();
    drawLevel(down.ctx, theme, line(82_400), win, 200, 320, theme.up, { top: 114, bottom: 52 });
    expect(down.tags[0]!.y).toBe(H - 58 - TAG_H);
  });

  it("a level in the plot but behind the header counts as off-screen; one in the clear keeps its own tag", () => {
    const hidden = recorder();
    drawLevel(hidden.ctx, theme, line(82_540), win, 200, 320, theme.up, { top: 114, bottom: 52 });
    expect(hidden.tags[0]).toEqual({ y: 120, text: "▲ Line $82,540.00" });
    const clear = recorder();
    drawLevel(clear.ctx, theme, line(82_500), win, 200, 320, theme.up, { top: 114, bottom: 52 });
    expect(clear.tags).toEqual([{ y: H / 2 - TAG_H / 2, text: "Line" }]);
    // Just under the header (y ≈ 124): its own tag clears the pin, so it keeps its line and tag, no ▲.
    const under = recorder();
    drawLevel(under.ctx, theme, line(82_510.66), win, 200, 320, theme.up, { top: 114, bottom: 52 });
    expect(under.tags[0]!.text).toBe("Line");
    expect(under.tags[0]!.y).toBeGreaterThanOrEqual(114 + 2);
  });

  it("a pinned tag steps past the price pill when they share a row (its near side if that clears the pin); a pill elsewhere leaves it be", () => {
    const pins = { top: 114, bottom: 52 };
    const up = recorder();
    drawLevel(up.ctx, theme, line(82_600), win, 200, 320, theme.up, pins, { top: 110, bottom: 136 });
    expect(up.tags[0]!.y).toBe(136 + 2);
    const down = recorder();
    drawLevel(down.ctx, theme, line(82_400), win, 200, 320, theme.up, pins, { top: 220, bottom: 246 });
    expect(down.tags[0]!.y).toBe(220 - 2 - TAG_H);
    const room = recorder();
    drawLevel(room.ctx, theme, line(82_600), win, 200, 320, theme.up, pins, { top: 136, bottom: 162 });
    expect(room.tags[0]!.y).toBe(136 - 2 - TAG_H);
    const apart = recorder();
    drawLevel(apart.ctx, theme, line(82_600), win, 200, 320, theme.up, pins, { top: 160, bottom: 186 });
    expect(apart.tags[0]!.y).toBe(120);
  });
});

describe("drawLevel tags never cover each other", () => {
  const signed = (price: number): ChartLevel => ({ kind: "signed", price, label: "Signed" });

  it("a second tag a few dollars from the first steps past it, away from it; its line stays", () => {
    const rec = recorder();
    const taken: { top: number; bottom: number }[] = [];
    drawLevel(rec.ctx, theme, line(82_500), win, 200, 320, theme.up, NO_PINS, null, taken);
    drawLevel(rec.ctx, theme, signed(82_498), win, 200, 320, theme.up, NO_PINS, null, taken);
    const [a, b] = rec.tags;
    expect(a).toEqual({ y: H / 2 - TAG_H / 2, text: "Line" });
    expect(b!.text).toBe("Signed");
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + TAG_H + 2);
    expect(taken).toHaveLength(2);
  });

  it("a tag pinned under the header steps below an in-plot tag on its row", () => {
    const pins = { top: 114, bottom: 52 };
    const rec = recorder();
    const taken: { top: number; bottom: number }[] = [];
    // The Line just under the header (y ≈ 128): its tag runs 120–135; the Signed value is behind the header.
    drawLevel(rec.ctx, theme, line(82_509), win, 200, 320, theme.up, pins, null, taken);
    drawLevel(rec.ctx, theme, signed(82_540), win, 200, 320, theme.up, pins, null, taken);
    const [l, s] = rec.tags;
    expect(s!.text).toBe("▲ Signed $82,540.00");
    expect(s!.y).toBeGreaterThanOrEqual(l!.y + TAG_H + 2);
  });
});

describe("clearRow", () => {
  it("keeps a free row, steps the way asked, and turns back at the bounds", () => {
    expect(clearRow(50, [], true, 0, 300)).toBe(50);
    expect(clearRow(50, [{ top: 45, bottom: 60 }], true, 0, 300)).toBe(62);
    expect(clearRow(50, [{ top: 45, bottom: 60 }], false, 0, 300)).toBe(45 - 2 - TAG_H);
    // Down would leave the plot (hi = 70): it goes up instead.
    expect(clearRow(50, [{ top: 45, bottom: 60 }], true, 0, 70)).toBe(45 - 2 - TAG_H);
    // Two rows in a stack: it steps past both.
    expect(clearRow(50, [{ top: 45, bottom: 60 }, { top: 62, bottom: 77 }], true, 0, 300)).toBe(79);
  });
});

describe("pinned tags, the pill and each other", () => {
  it("two levels behind the header stack under it, and the second steps past the pill too", () => {
    const pins = { top: 114, bottom: 52 };
    const rec = recorder();
    const taken: { top: number; bottom: number }[] = [];
    const pill = { top: 134, bottom: 160 };
    drawLevel(rec.ctx, theme, line(82_545), win, 200, 320, theme.up, pins, pill, taken);
    drawLevel(rec.ctx, theme, { kind: "signed", price: 82_550, label: "Signed" }, win, 200, 320, theme.up, pins, pill, taken);
    const [l, s] = rec.tags;
    // The Line's pin (120) meets the pill; the pill's near side, 117, still clears the header.
    expect(l!.y).toBe(134 - 2 - TAG_H);
    // The Signed value meets the Line, then the pill: below both.
    expect(s!.y).toBe(160 + 2);
  });
});
