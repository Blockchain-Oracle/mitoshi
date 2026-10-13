import { describe, expect, it } from "vitest";
import { imageSize } from "./image-size";

const bytes = (hex: string) => Uint8Array.from(hex.replace(/\s+/g, "").match(/../g)!.map((h) => parseInt(h, 16)));

describe("imageSize — a launch logo's header (R4-11)", () => {
  it("reads a PNG's IHDR", () => {
    const png = bytes("89504e470d0a1a0a 0000000d 49484452 00000080 00000040 0806000000");
    expect(imageSize(png)).toEqual({ type: "image/png", width: 128, height: 64 });
  });
  it("reads a JPEG's SOF0 past an APP0 segment", () => {
    const jpg = bytes("ffd8 ffe0 0010 4a46494600010100000100010000 ffc0 0011 08 0100 0200 03 012200 021101 031101");
    expect(imageSize(jpg)).toEqual({ type: "image/jpeg", width: 512, height: 256 });
  });
  it("reads a lossless WebP (VP8L) and an extended one (VP8X)", () => {
    // VP8L: 0x2f signature, then 14-bit width−1 and height−1: 256 × 256 → 255 | 255 << 14.
    const bits = 255 | (255 << 14);
    const vp8l = new Uint8Array(30);
    vp8l.set(bytes("52494646 00000000 57454250 5650384c 00000000 2f"));
    vp8l.set([bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff], 21);
    expect(imageSize(vp8l)).toEqual({ type: "image/webp", width: 256, height: 256 });
    const vp8x = new Uint8Array(30);
    vp8x.set(bytes("52494646 00000000 57454250 56503858 0a000000 00000000 ff0100 ff0100"));
    expect(imageSize(vp8x)).toEqual({ type: "image/webp", width: 512, height: 512 });
  });
  it("refuses anything else", () => {
    expect(imageSize(bytes("474946383961 0100 0100"))).toBeNull();
    expect(imageSize(new Uint8Array(0))).toBeNull();
  });
});
