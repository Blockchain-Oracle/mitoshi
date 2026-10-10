"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/share-png.ts (Tradash's 1600×1000 share image), re-branded
// for Mitoshi (S5 L-22, S23g's share modal): Owarine's keychain charm on the sky becomes Masayume's cream receipt,
// tilted on Mitoshi's dark ground, with the 見通し seal and the vermilion point of the mark.
import qrcode from "qrcode-generator";
import { tokens } from "@cwf/tokens";

/** What a card states: the call, its result, the entry and the exit or mark price, and the link it carries. */
export interface ShareCard {
  /** "BTC UP · 5M". */
  call: string;
  /** "+$0.48 · +48.0%". */
  result: string;
  win: boolean;
  entry: string | null;
  exit: string | null;
  exitLabel: "Mark" | "Exit";
  url: string;
}

const W = 1600;
const H = 1000;
const p = tokens.palette.dark;
const s = tokens.shared;
/** The ground is the dark palette; the receipt is cream, so its profit and loss read in the light palette's inks. */
const C = { ground: p.bg, ink: s["cream-ink"], card: s.cream, edge: s["cream-hairline"], white: p.white, soft: p["gray-400"], accent: p.vermilion, up: tokens.palette.light.profit, down: tokens.palette.light.loss } as const;
const font = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

/** The page's own faces (`lib/fonts.ts` variables, set on <body>), with system fallbacks. */
function faces() {
  const cs = getComputedStyle(document.body);
  const v = (n: string, fallback: string) => cs.getPropertyValue(n).trim() || fallback;
  return { display: v("--font-sora", "system-ui"), body: v("--font-inter", "system-ui"), jp: v("--font-noto-serif-jp", "serif") };
}

function fit(ctx: CanvasRenderingContext2D, text: string, f: (px: number) => string, maxW: number, start: number): number {
  let px = start;
  ctx.font = f(px);
  while (px > 24 && ctx.measureText(text).width > maxW) ctx.font = f((px -= 4));
  return px;
}

function qr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const cell = size / (n + 2);
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = p.bg;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + (c + 1) * cell, y + (r + 1) * cell, Math.ceil(cell), Math.ceil(cell));
}

/** The Mitoshi mark (`MitoshiMark.tsx`'s 266×322 drawing) at `scale`, its top-left at (x, y). */
function mark(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 30;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D("M36 262 H230"));
  ctx.stroke(new Path2D("M52 214 C 104 214, 132 142, 190 108"));
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(206, 88, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export async function renderSharePng(card: ShareCard): Promise<Blob> {
  const f = faces();
  // The seal's face loads on first use (`lib/fonts.ts`): ask for its glyphs before drawing them.
  await Promise.allSettled([document.fonts.load(font(700, 120, f.jp), "見通し"), document.fonts.load(font(700, 96, f.display), card.call)]);
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // The ground, with the accent's glow behind the receipt.
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(560, 520, 40, 560, 520, 620);
  glow.addColorStop(0, "rgba(224, 77, 38, 0.28)");
  glow.addColorStop(1, "rgba(224, 77, 38, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // The receipt, tilted.
  ctx.save();
  ctx.translate(560, 520);
  ctx.rotate((-3 * Math.PI) / 180);
  const cw = 820;
  const ch = 640;
  ctx.fillStyle = C.edge;
  ctx.beginPath();
  ctx.roundRect(-cw / 2 - 6, -ch / 2 - 6, cw + 12, ch + 12, 48);
  ctx.fill();
  ctx.fillStyle = C.card;
  ctx.beginPath();
  ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 44);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(-cw / 2 + 64, -ch / 2 + 64, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const left = -cw / 2 + 60;
  ctx.fillStyle = C.ink;
  fit(ctx, card.call.toUpperCase(), (px) => font(800, px, f.display), cw - 120, 88);
  ctx.fillText(card.call.toUpperCase(), left, -ch / 2 + 190);
  ctx.fillStyle = card.win ? C.up : C.down;
  fit(ctx, card.result, (px) => font(800, px, f.display), cw - 120, 150);
  ctx.fillText(card.result, left, -ch / 2 + 370);
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.7;
  ctx.font = font(600, 36, f.body);
  if (card.entry) ctx.fillText(`Entry ${card.entry}`, left, -ch / 2 + 470);
  if (card.exit) ctx.fillText(`${card.exitLabel} ${card.exit}`, left, -ch / 2 + 520);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.accent;
  ctx.font = font(700, 120, f.jp);
  ctx.textAlign = "right";
  ctx.fillText("見通し", cw / 2 - 50, ch / 2 - 50);
  ctx.restore();

  // The brand and the way in.
  ctx.textAlign = "left";
  mark(ctx, 1080, 300, 0.42);
  ctx.fillStyle = C.white;
  ctx.font = font(800, 88, f.display);
  ctx.fillText("MITOSHI", 1080, 520);
  ctx.font = font(600, 34, f.body);
  ctx.fillText("Call where a price closes.", 1080, 572);
  ctx.fillStyle = C.soft;
  ctx.fillText("On Tempo testnet.", 1080, 614);
  const link = card.url.replace(/^https?:\/\//, "");
  fit(ctx, link, (px) => font(600, px, f.body), W - 1080 - 40, 30);
  ctx.fillText(link, 1080, 668);
  qr(ctx, card.url, 1080, 700, 210);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG render failed"))), "image/png"));
}

/** Saves the PNG: the system share sheet where a phone can share files, else a download. */
export async function saveSharePng(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      // Cancelled or refused: fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
  return "downloaded";
}
