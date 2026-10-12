import { describe, expect, it } from "vitest";
import { meetsAny, sealZones } from "./useStepAside";

// The measured cases from the live check (R4-0, D-227): the seal is 60 × 60 at 22 px from the corner.
const at = (vw: number, vh: number) => sealZones({ right: vw - 22, bottom: vh - 22 }, { width: 60, height: 60 });

describe("the floating seal steps aside off a primary action", () => {
  it("covers the ticket's button on a 1280 × 720 laptop, so it steps aside", () => {
    const { seal } = at(1280, 720);
    expect(meetsAny(seal, [{ left: 896, top: 621, right: 1224, bottom: 673 }])).toBe(true);
  });

  it("keeps the seal at 1024 × 768 but quiets the teaser, whose band reaches the button", () => {
    const { seal, band } = at(1024, 768);
    const cta = { left: 668, top: 621, right: 968, bottom: 673 };
    expect(meetsAny(seal, [cta])).toBe(false);
    expect(meetsAny(band, [cta])).toBe(true);
  });

  it("leaves both alone when the action is far off (768 × 1024, the hero's UP/DOWN)", () => {
    const { seal, band } = at(768, 1024);
    const pills = [
      { left: 161, top: 485, right: 429, bottom: 522 },
      { left: 438, top: 485, right: 705, bottom: 522 },
    ];
    expect(meetsAny(seal, pills)).toBe(false);
    expect(meetsAny(band, pills)).toBe(false);
  });

  it("keeps air between them: an action 4 px off still counts, 12 px off does not", () => {
    const box = { left: 100, top: 100, right: 160, bottom: 160 };
    expect(meetsAny(box, [{ left: 164, top: 100, right: 200, bottom: 160 }])).toBe(true);
    expect(meetsAny(box, [{ left: 172, top: 100, right: 200, bottom: 160 }])).toBe(false);
    expect(meetsAny(box, [])).toBe(false);
  });

  it("puts the teaser band right above the seal, at least the seal's width", () => {
    const { seal, band } = sealZones({ right: 500, bottom: 400 }, { width: 200, height: 50 });
    expect(seal).toEqual({ left: 300, top: 350, right: 500, bottom: 400 });
    expect(band.bottom).toBe(seal.top);
    expect(band.left).toBe(300);
  });
});
