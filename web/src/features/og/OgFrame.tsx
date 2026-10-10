// Ported from Agari 4c0278ad:web/src/features/landing/og/{OgFrame,OgMark}.tsx — Mitoshi's mark and words.
import { TICKERS, type TickerSymbol } from "@cwf/core";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/copy";
import { OG_COPY } from "./copy";
import { OG, OG_PAD } from "./theme";

const CROP = 28;
const CROP_INSET = 32;

/** Masayume's `.crop` corner marks, one L per corner, drawn with per-side borders satori understands. */
function Crop({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  const top = at[0] === "t";
  const left = at[1] === "l";
  return (
    <div
      style={{
        position: "absolute",
        width: CROP,
        height: CROP,
        ...(top ? { top: CROP_INSET } : { bottom: CROP_INSET }),
        ...(left ? { left: CROP_INSET } : { right: CROP_INSET }),
        ...(top ? { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: OG.crop } : { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: OG.crop }),
        ...(left ? { borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: OG.crop } : { borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: OG.crop }),
      }}
    />
  );
}

/** The Mitoshi mark (`components/shell/MitoshiMark.tsx`'s horizon, rising path and vermilion point) and the wordmark. */
function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width={36} height={44} viewBox="0 0 266 322" xmlns="http://www.w3.org/2000/svg">
        <path d="M36 262 H230" stroke={OG.ink} fill="none" strokeWidth="30" strokeLinecap="round" />
        <path d="M52 214 C 104 214, 132 142, 190 108" stroke={OG.ink} fill="none" strokeWidth="30" strokeLinecap="round" />
        <circle cx="206" cy="88" r="30" fill={OG.vermilion} />
      </svg>
      <div style={{ display: "flex", fontSize: 30, letterSpacing: "0.22em", color: OG.ink }}>{BRAND.name.toUpperCase()}</div>
    </div>
  );
}

/** Every preview: the dark ground, the crop marks, the wordmark and an eyebrow on top, the honesty line at the foot. */
export function OgFrame({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: OG_PAD, background: OG.ground, color: OG.ink, fontFamily: "Sora" }}>
      <Crop at="tl" />
      <Crop at="tr" />
      <Crop at="bl" />
      <Crop at="br" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Wordmark />
        <div style={{ display: "flex", fontSize: 18, letterSpacing: "0.18em", textTransform: "uppercase", color: OG.dim }}>{eyebrow}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>{children}</div>
      {/* Not uppercased: "pathUSD" is a name with fixed casing. */}
      <div style={{ display: "flex", fontSize: 22, letterSpacing: "0.04em", color: OG.dim }}>{OG_COPY.honesty}</div>
    </div>
  );
}

/**
 * An asset disc for satori: the registry's brand colour and monogram, the way the app marks an asset with no glyph.
 * The preview face has no ₿ or Ξ, so a non-Latin monogram falls back to the ticker's first letter.
 */
export function OgMark({ symbol, size }: { symbol: TickerSymbol; size: number }) {
  const { brand } = TICKERS[symbol];
  const monogram = /^[A-Z]$/.test(TICKERS[symbol].monogram) ? TICKERS[symbol].monogram : symbol[0];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size / 2, background: brand.hex, color: OG.ink, fontSize: Math.round((size * 15) / 32) }}>
      {monogram}
    </div>
  );
}
