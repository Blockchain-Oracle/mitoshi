// Ported from Owarine 90a91d71:web/src/components/icons/asset-marks/AssetMarkSvg.tsx (O-1, D-222)
import type { BrandSlug } from "@cwf/core";
import { MARK_GLYPHS, glyphTransform } from "./paths";

interface AssetMarkSvgProps {
  slug: BrandSlug;
  /** Typed on the disc when the brand has no glyph. */
  monogram: string;
  className?: string;
}

/**
 * One listed asset's mark in the grammar of `../AssetMarks.tsx` (Masayume's `BitcoinMark`): a 32-unit
 * viewBox, the brand-colour circle the mark carries itself, a white glyph. The fills live in
 * `styles/icons.css` — design-literals keeps hex out of TSX — and the glyph placement in `paths.ts`.
 * A brand without a glyph types its registry monogram instead.
 */
export function AssetMarkSvg({ slug, monogram, className }: AssetMarkSvgProps) {
  const glyph = MARK_GLYPHS[slug];
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden focusable="false">
      <circle cx="16" cy="16" r="16" className={`mark-${slug}-disc`} />
      {glyph?.ring && <circle cx="16" cy="16" r="15.5" className="mark-ring" />}
      {glyph ? (
        <path className="mark-glyph" transform={glyphTransform(glyph)} d={glyph.d} />
      ) : (
        <text className="mark-monogram" x="16" y="16.5">
          {monogram}
        </text>
      )}
    </svg>
  );
}
