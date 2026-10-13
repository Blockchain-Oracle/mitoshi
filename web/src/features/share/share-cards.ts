"use client";
// The call and verdict share images (R4-13a, D-227) beside the position card (`share-png.ts`), ported in role from
// Owarine 90a91d71:web/src/features/share/{call-card,trade-card}.ts: one 1600 × 1000 PNG per kind, Mitoshi's cream
// receipt tilted on the dark ground with the brand, the link and its QR on the right.
//  · A call is an OPEN position with no result: stake → what it wins IF IT LANDS, and the Window's real close as an
//    absolute UTC time (never "settles in ~Xm", which goes stale once shared). The QR opens the market's terminal.
//  · A verdict is the Window's stamp (WON / LOST / VOID in the stamp face), the close print and who signed it; the QR
//    opens the Window's proof page, where anyone can re-verify the print.
//  · A score is an arcade run's game-over (Ported from Senryo:features/games/arcade/StageParts.tsx's OverPlate Share):
//    the game, the score, a NEW BEST stamp when it is one, where it ranked, the run's seed and length; the QR opens the game.
import { C, faces, fit, font, H, mark, qr, renderSharePng, W, type ShareCard } from "./share-png";

export interface CallShare {
  /** "BTC UP · 5M". */
  call: string;
  /** "BTC OVER $64,316". */
  band: string;
  stake: string;
  toWin: string;
  /** "2026-10-13 14:05 UTC" — the Window's close. */
  closes: string;
  url: string;
}

export interface VerdictShare {
  /** "BTC UP · 5M". */
  call: string;
  outcome: "win" | "loss" | "void";
  /** "Closed $67,120.45"; null when the close print isn't read. */
  close: string | null;
  /** "Signed by RedStone". */
  signed: string | null;
  /** The proof page. */
  url: string;
}

export interface ScoreShare {
  /** "LINE RIDER". */
  game: string;
  /** "12,480". */
  score: string;
  best: boolean;
  /** "Ranked #3"; null when the run posted nothing. */
  rank: string | null;
  /** "Seed 7f3a · 41.2 s". */
  meta: string;
  url: string;
}

export type ShareImage = ({ kind: "position" } & ShareCard) | ({ kind: "call" } & CallShare) | ({ kind: "verdict" } & VerdictShare) | ({ kind: "score" } & ScoreShare);

const RECEIPT = { x: 560, y: 520, w: 820, h: 640 } as const;
const STAMP = { win: "WON", loss: "LOST", void: "VOID" } as const;
const WORDS = {
  stakeToWin: "STAKE  →  WIN IF IT LANDS",
  winIfLands: "Win if it lands.",
  closes: (utc: string) => `Closes ${utc}`,
  tagline: "Call where a price closes.",
  network: "On Tempo testnet.",
  verify: "VERIFY ON THE PROOF PAGE",
  scan: "SCAN TO MAKE YOUR CALL",
  beat: "SCAN TO BEAT IT",
  newBest: "NEW BEST",
} as const;

/** The ground, the accent's glow, and the tilted receipt; the context is left translated to the receipt's centre. */
function frame(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(RECEIPT.x, RECEIPT.y, 40, RECEIPT.x, RECEIPT.y, 620);
  glow.addColorStop(0, "rgba(224, 77, 38, 0.28)");
  glow.addColorStop(1, "rgba(224, 77, 38, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(RECEIPT.x, RECEIPT.y);
  ctx.rotate((-3 * Math.PI) / 180);
  const { w, h } = RECEIPT;
  ctx.fillStyle = C.edge;
  ctx.beginPath();
  ctx.roundRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 48);
  ctx.fill();
  ctx.fillStyle = C.card;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 44);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(-w / 2 + 64, -h / 2 + 64, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

/** The right column: the mark, the name, the line, the link and its QR, under `cue`. */
function brand(ctx: CanvasRenderingContext2D, f: ReturnType<typeof faces>, url: string, cue: string): void {
  ctx.textAlign = "left";
  mark(ctx, 1080, 260, 0.42);
  ctx.fillStyle = C.white;
  ctx.font = font(800, 88, f.display);
  ctx.fillText("MITOSHI", 1080, 480);
  ctx.font = font(600, 34, f.body);
  ctx.fillText(WORDS.tagline, 1080, 532);
  ctx.fillStyle = C.soft;
  ctx.fillText(WORDS.network, 1080, 574);
  ctx.font = font(700, 24, f.body);
  ctx.fillText(cue, 1080, 640);
  const link = url.replace(/^https?:\/\//, "");
  fit(ctx, link, (px) => font(600, px, f.body), W - 1080 - 40, 28);
  ctx.fillText(link, 1080, 680);
  qr(ctx, url, 1080, 708, 210);
}

const blob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG render failed"))), "image/png"));

function canvas2d(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  return { canvas, ctx: canvas.getContext("2d")! };
}

export async function renderCallPng(card: CallShare): Promise<Blob> {
  const f = faces();
  const wager = `${card.stake}  →  ${card.toWin}`;
  await Promise.allSettled([document.fonts.load(font(800, 96, f.display), card.band), document.fonts.load(font(800, 96, f.display), wager)]);
  await document.fonts.ready;
  const { canvas, ctx } = canvas2d();
  frame(ctx);
  const { w, h } = RECEIPT;
  const left = -w / 2 + 60;
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.7;
  ctx.font = font(700, 30, f.body);
  ctx.fillText(card.call.toUpperCase(), left + 40, -h / 2 + 74);
  ctx.globalAlpha = 1;
  fit(ctx, card.band.toUpperCase(), (px) => font(800, px, f.display), w - 120, 84);
  ctx.fillText(card.band.toUpperCase(), left, -h / 2 + 200);
  ctx.globalAlpha = 0.6;
  ctx.font = font(700, 26, f.body);
  ctx.fillText(WORDS.stakeToWin, left, -h / 2 + 290);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.up;
  fit(ctx, wager, (px) => font(800, px, f.display), w - 120, 104);
  ctx.fillText(wager, left, -h / 2 + 400);
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.7;
  ctx.font = font(600, 34, f.body);
  ctx.fillText(WORDS.winIfLands, left, -h / 2 + 480);
  ctx.fillText(WORDS.closes(card.closes), left, -h / 2 + 530);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.accent;
  ctx.font = font(700, 96, f.jp);
  ctx.textAlign = "right";
  ctx.fillText("見通し", w / 2 - 50, h / 2 - 40);
  ctx.restore();
  brand(ctx, f, card.url, WORDS.scan);
  return blob(canvas);
}

export async function renderVerdictPng(card: VerdictShare): Promise<Blob> {
  const f = faces();
  const stamp = STAMP[card.outcome];
  await Promise.allSettled([document.fonts.load(font(700, 200, f.jp), stamp), document.fonts.load(font(800, 88, f.display), card.call)]);
  await document.fonts.ready;
  const { canvas, ctx } = canvas2d();
  frame(ctx);
  const { w, h } = RECEIPT;
  const left = -w / 2 + 60;
  ctx.fillStyle = C.ink;
  fit(ctx, card.call.toUpperCase(), (px) => font(800, px, f.display), w - 120, 80);
  ctx.fillText(card.call.toUpperCase(), left, -h / 2 + 180);
  // The stamp: the stamp face, tilted, ringed in its colour — vermilion for a win, the loss ink, or quiet for a void.
  const tone = card.outcome === "win" ? C.accent : card.outcome === "loss" ? C.down : C.ink;
  ctx.save();
  ctx.translate(left + 230, -h / 2 + 330);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.strokeStyle = tone;
  ctx.lineWidth = 10;
  ctx.globalAlpha = card.outcome === "void" ? 0.6 : 1;
  ctx.beginPath();
  ctx.roundRect(-230, -95, 460, 170, 24);
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.textAlign = "center";
  fit(ctx, stamp, (px) => font(700, px, f.jp), 400, 150);
  ctx.fillText(stamp, 0, 45);
  ctx.restore();
  ctx.fillStyle = C.ink;
  ctx.textAlign = "left";
  ctx.globalAlpha = 0.75;
  ctx.font = font(600, 36, f.body);
  if (card.close) ctx.fillText(card.close, left, -h / 2 + 500);
  if (card.signed) ctx.fillText(card.signed, left, -h / 2 + 550);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.accent;
  ctx.font = font(700, 96, f.jp);
  ctx.textAlign = "right";
  ctx.fillText("見通し", w / 2 - 50, h / 2 - 40);
  ctx.restore();
  brand(ctx, f, card.url, WORDS.verify);
  return blob(canvas);
}

export async function renderScorePng(card: ScoreShare): Promise<Blob> {
  const f = faces();
  await Promise.allSettled([document.fonts.load(font(800, 200, f.display), card.score), document.fonts.load(font(700, 96, f.jp), WORDS.newBest)]);
  await document.fonts.ready;
  const { canvas, ctx } = canvas2d();
  frame(ctx);
  const { w, h } = RECEIPT;
  const left = -w / 2 + 60;
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.7;
  ctx.font = font(700, 30, f.body);
  ctx.fillText(card.game.toUpperCase(), left + 40, -h / 2 + 74);
  ctx.globalAlpha = 1;
  fit(ctx, card.score, (px) => font(800, px, f.display), w - 120, 200);
  ctx.fillText(card.score, left, -h / 2 + 300);
  if (card.best) {
    ctx.save();
    ctx.translate(left + 170, -h / 2 + 400);
    ctx.rotate((-6 * Math.PI) / 180);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(-170, -56, 340, 100, 20);
    ctx.stroke();
    ctx.fillStyle = C.accent;
    ctx.textAlign = "center";
    fit(ctx, WORDS.newBest, (px) => font(700, px, f.jp), 300, 64);
    ctx.fillText(WORDS.newBest, 0, 18);
    ctx.restore();
  }
  ctx.fillStyle = C.ink;
  ctx.textAlign = "left";
  ctx.globalAlpha = 0.75;
  ctx.font = font(600, 36, f.body);
  if (card.rank) ctx.fillText(card.rank, left, -h / 2 + 510);
  ctx.globalAlpha = 0.55;
  ctx.font = font(600, 28, f.body);
  ctx.fillText(card.meta, left, -h / 2 + 556);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.accent;
  ctx.font = font(700, 96, f.jp);
  ctx.textAlign = "right";
  ctx.fillText("見通し", w / 2 - 50, h / 2 - 40);
  ctx.restore();
  brand(ctx, f, card.url, WORDS.beat);
  return blob(canvas);
}

/** One entry for every kind of card. */
export function renderShareImage(image: ShareImage): Promise<Blob> {
  if (image.kind === "call") return renderCallPng(image);
  if (image.kind === "verdict") return renderVerdictPng(image);
  if (image.kind === "score") return renderScorePng(image);
  return renderSharePng(image);
}
