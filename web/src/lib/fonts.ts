// Ported from Masayume 68f7a09:web/src/lib/fonts.ts — the same four faces and variable names (the ported design
// system addresses them), with the plan §3.2 preload budget: only the LCP faces (Sora headings, Inter body) preload;
// JetBrains Mono (figures) and Noto Serif JP (verdict stamps, latin subset; CJK glyphs load by unicode-range on use)
// load on first use.
import { Inter, JetBrains_Mono, Noto_Serif_JP, Sora } from "next/font/google";

export const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap", weight: ["400", "600", "700", "800"] });

export const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap", weight: ["400", "500", "600"], preload: false });

export const notoSerifJp = Noto_Serif_JP({ variable: "--font-noto-serif-jp", subsets: ["latin"], display: "swap", weight: ["500", "700"], preload: false });

export const fontVariables = [sora.variable, inter.variable, jetbrainsMono.variable, notoSerifJp.variable].join(" ");
