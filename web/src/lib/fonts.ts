// Ported from Masayume 68f7a09:web/src/lib/fonts.ts — the same four faces and variable names (the ported design
// system addresses them), with the plan §3.2 preload budget: only the LCP faces (Sora headings, Inter body) preload;
// JetBrains Mono (figures) and Noto Serif JP (verdict stamps, the brand's 見通し) load on first use.
//
// Noto Serif JP is self-hosted as a SUBSET (§3.1): next/font/google's CJK slicing emitted ~250 @font-face rules (185 KB
// of CSS on every route) for a product that uses eight Japanese glyphs. `src/fonts/noto-serif-jp/{500,700}.woff2` are
// Google Fonts' own subsets (css2 `text=`: printable ASCII, · — – … ’ “ ” ← → ↗ ✓ ×, and し効夢正無見逆通), ~18 KB each,
// SIL OFL 1.1 (`OFL.txt` beside them). A new Japanese glyph in copy means regenerating them with the same `text=` call.
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import localFont from "next/font/local";

export const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap", weight: ["400", "600", "700", "800"] });

export const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap", weight: ["400", "500", "600"], preload: false });

export const notoSerifJp = localFont({
  variable: "--font-noto-serif-jp",
  display: "swap",
  preload: false,
  src: [
    { path: "../fonts/noto-serif-jp/500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/noto-serif-jp/700.woff2", weight: "700", style: "normal" },
  ],
});

export const fontVariables = [sora.variable, inter.variable, jetbrainsMono.variable, notoSerifJp.variable].join(" ");
