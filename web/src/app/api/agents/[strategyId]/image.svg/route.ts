import { tokens } from "@cwf/tokens";

/**
 * The agent image an ERC-8004 registration file names (`image`, for ERC-721 apps): the Mitoshi mark
 * (`components/shell/MitoshiMark.tsx` geometry) on the dark ground, colours from `@cwf/tokens`. Static per strategy.
 */
export function GET(): Response {
  const p = tokens.palette.dark;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-67 -39 400 400" width="400" height="400"><rect x="-67" y="-39" width="400" height="400" fill="${p.bg}"/><path d="M36 262 H230" stroke="${p.white}" fill="none" stroke-width="30" stroke-linecap="round"/><path d="M52 214 C 104 214, 132 142, 190 108" stroke="${p.white}" fill="none" stroke-width="30" stroke-linecap="round"/><circle cx="206" cy="88" r="30" fill="${p.vermilion}"/></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400, immutable" } });
}
