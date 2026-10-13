// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/reply-card.ts — S11 (D-227): the receipt reply's image,
// re-branded the way Mitoshi's share cards are (web/src/features/share/share-png.ts): the dark ground with the
// vermilion glow, the cream receipt tilted, the Mitoshi mark path for path and its seal. Every fact comes from
// `reply-format.ts`'s presentation; the renderer re-checks each one, so a bad value draws a safe fallback, never itself.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NETWORK_LABEL, X_REFUSAL_TITLES, type XReceiptStatus } from "@cwf/core";
import { tokens } from "@cwf/tokens";

/** A structural subset of `ReplyPresentation`. */
export interface ReplyCardInput {
  status: XReceiptStatus;
  title?: string;
  detail?: string | null;
  context?: string | null;
  network?: string;
  site?: string;
  sender?: string | null;
  txHash?: string | null;
}

export interface ReplyCardOptions {
  /** Only for review fixtures. Never disguise a fixture as a real receipt. */
  demo?: boolean;
}

export const REPLY_CARD_WIDTH = 1200;
export const REPLY_CARD_HEIGHT = 600;

interface OutlineFont {
  getAdvanceWidth(text: string, size: number, options?: { kerning: boolean }): number;
  getPath(text: string, x: number, y: number, size: number, options?: { kerning: boolean }): { toPathData(places: number): string };
}
const require = createRequire(import.meta.url);
const opentype = require("opentype.js") as { loadSync(file: string): OutlineFont };
// The licensed fonts live with the actor, so the ops image's `COPY . .` carries them (reply-card-assets/README.md).
const sora = opentype.loadSync(fileURLToPath(new URL("./reply-card-assets/Sora-SemiBold.ttf", import.meta.url)));
const inter = opentype.loadSync(fileURLToPath(new URL("./reply-card-assets/Inter-Regular.ttf", import.meta.url)));

const dark = tokens.palette.dark;
const shared = tokens.shared;
const C = {
  ground: dark.bg, ink: dark.white, soft: dark["gray-400"], rule: dark["gray-800"], accent: dark.vermilion,
  card: shared.cream, cardInk: shared["cream-ink"], edge: shared["cream-hairline"],
} as const;

/** The status's own headline and footer: fixed copy, never the caller's. */
const STATES: Record<XReceiptStatus, { title: string; footer: string }> = {
  filled: { title: "Filled", footer: "The result comes at the close." },
  "nothing-filled": { title: "No fill", footer: "A confirmed order can still fill nothing." },
  reverted: { title: "Reverted", footer: "Your balance is unchanged." },
  refused: { title: "Order not confirmed", footer: "Nothing was placed." },
  submitted: { title: "Needs checking", footer: "Not confirmed yet." },
  unknown: { title: "Needs checking", footer: "Check the app before trying again." },
};
const REFUSAL_TITLES: readonly string[] = [...Object.values(X_REFUSAL_TITLES), STATES.refused.title];
const NETWORKS: readonly string[] = Object.values(NETWORK_LABEL);

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function plain(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  // Bound the work first, strip XML-invalid, control and bidi characters, and collapse line breaks, so data cannot
  // move itself around the composition.
  const cleaned = value.slice(0, 2048)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿￾￿]/g, "")
    .replace(/\s+/g, " ").trim();
  const chars = Array.from(cleaned);
  return chars.length > limit ? `${chars.slice(0, limit - 1).join("")}…` : cleaned;
}

const width = (font: OutlineFont, value: string, size: number): number => font.getAdvanceWidth(value, size, { kerning: true });

/** Wraps even one long token and ellipsizes without crossing the text column. */
function lines(value: string, font: OutlineFont, size: number, maxWidth: number, maxLines: number): string[] {
  const remaining = Array.from(value);
  const result: string[] = [];
  while (remaining.length > 0 && result.length < maxLines) {
    let end = 0;
    while (end < remaining.length && width(font, remaining.slice(0, end + 1).join(""), size) <= maxWidth) end++;
    if (end === remaining.length) { result.push(remaining.join("").trim()); break; }
    if (result.length === maxLines - 1) {
      const tail = remaining.slice(0, Math.max(1, end));
      while (tail.length && width(font, `${tail.join("").trimEnd()}…`, size) > maxWidth) tail.pop();
      result.push(`${tail.join("").trimEnd()}…`);
      break;
    }
    const space = remaining.slice(0, end).lastIndexOf(" ");
    const split = space > end / 2 ? space : Math.max(1, end);
    result.push(remaining.splice(0, split).join("").trim());
    while (remaining[0] === " ") remaining.shift();
  }
  return result;
}

function text(value: string, x: number, baseline: number, size: number, fill: string, font = inter): string {
  return `<g role="img" aria-label="${escapeXml(value)}"><path d="${font.getPath(value, x, baseline, size, { kerning: true }).toPathData(2)}" fill="${fill}"/></g>`;
}

/** The Mitoshi mark (MitoshiMark.tsx's 266×322 drawing: the horizon, the path rising over it, the one vermilion point). */
function mark(x: number, y: number, height: number, ink: string): string {
  return `<g transform="translate(${x} ${y}) scale(${(height / 322).toFixed(4)})" aria-hidden="true">
<path d="M36 262 H230" stroke="${ink}" fill="none" stroke-width="30" stroke-linecap="round"/>
<path d="M52 214 C 104 214, 132 142, 190 108" stroke="${ink}" fill="none" stroke-width="30" stroke-linecap="round"/>
<circle cx="206" cy="88" r="30" fill="${C.accent}"/></g>`;
}

/** The seal (components/kit/Seal.tsx, ink tone): the mark in a disc, tilted. */
function seal(cx: number, cy: number, r: number): string {
  const h = r * 1.1;
  return `<g transform="rotate(-6 ${cx} ${cy})" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.cardInk}"/>${mark(cx - (h * 266) / 322 / 2, cy - h / 2, h, C.card)}</g>`;
}

/** The status in the receipt's ring, drawn about (0, 0): a check means filled, never that the call won. */
const SYMBOLS: Record<XReceiptStatus, string> = {
  filled: "M-42 0L-16 29L35 -33",
  submitted: "M0 -38V0L22 17",
  unknown: "M-17 -23C-17 -44 19 -44 19 -23C19 -9 1 -9 1 7M1 27V29",
  refused: "M-21 -26L21 22M21 -26L-21 22",
  reverted: "M15 -33H-18L-34 -15L-18 2M-33 -15H9C38 -15 38 27 9 27H-10",
  "nothing-filled": "M-26 0H27",
};

function receiptArt(status: XReceiptStatus): string {
  const [x, y, w, h] = [800, 96, 300, 388];
  const [cx, cy] = [x + w / 2, y + h / 2];
  return `<g aria-hidden="true" transform="rotate(-3 ${cx} ${cy})">
<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="34" fill="${C.edge}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${C.card}"/>
<circle cx="${x + 34}" cy="${y + 34}" r="8" fill="${C.accent}"/>
${seal(cx, y + 76, 38)}
<path d="M${x + 28} ${y + 140}H${x + w - 28}M${x + 28} ${y + 318}H${x + w - 28}M${x + 28} ${y + 342}H${x + w - 100}" stroke="${C.edge}" stroke-width="2"/>
<circle cx="${cx}" cy="${y + 229}" r="62" stroke="${C.accent}" stroke-width="4" fill="none"/>
<g data-symbol="${status}" transform="translate(${cx} ${y + 229})" fill="none" stroke="${C.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="${SYMBOLS[status]}"/></g>
</g>`;
}

/** The facts as self-contained vector paths: no font, image or network dependency. */
export function renderReplyCardSvg(input: ReplyCardInput, options: ReplyCardOptions = {}): string {
  const status: XReceiptStatus = Object.hasOwn(STATES, input.status) ? input.status : "unknown";
  const state = STATES[status];
  // Only the fixed refusal titles may refine a refusal's headline; nothing else may name the outcome.
  const title = status === "refused" && typeof input.title === "string" && REFUSAL_TITLES.includes(input.title) ? input.title : state.title;
  const network = typeof input.network === "string" && NETWORKS.includes(input.network) ? input.network : "Tempo";
  const site = typeof input.site === "string" && /^[a-z0-9.-]{1,64}(:\d{1,5})?$/.test(input.site) ? input.site : "mitoshi.xyz";
  const context = plain(input.context, 180) || network;
  const detail = plain(input.detail, 420) || "Details in the reply.";
  const sender = typeof input.sender === "string" && /^@[A-Za-z0-9_]{1,15}$/.test(input.sender) ? input.sender : null;
  const hash = typeof input.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(input.txHash) ? input.txHash : null;
  const contextLines = lines(context, inter, 27, 660, 2);
  const detailLines = lines(detail, inter, 22, 660, 2);
  const titleSize = Math.min(72, 660 / width(sora, title, 1));
  const banner = options.demo ? "DEMO · NOT A REAL TRADE" : network.toUpperCase();
  const tx = hash ? `TX ${hash}` : "";
  const description = `${banner}. ${sender ? `For ${sender}. ` : ""}${title}. ${contextLines.join(" ")}. ${detailLines.join(" ")}. ${state.footer}${hash ? ` Transaction ${hash}.` : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${REPLY_CARD_WIDTH} ${REPLY_CARD_HEIGHT}" width="${REPLY_CARD_WIDTH}" height="${REPLY_CARD_HEIGHT}" role="img" aria-labelledby="reply-title reply-description" data-status="${status}">
<title id="reply-title">${escapeXml(title)} — Mitoshi</title>
<desc id="reply-description">${escapeXml(description)}</desc>
<defs><radialGradient id="glow" cx="950" cy="290" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient></defs>
<rect width="${REPLY_CARD_WIDTH}" height="${REPLY_CARD_HEIGHT}" fill="${C.ground}"/>
<rect width="${REPLY_CARD_WIDTH}" height="${REPLY_CARD_HEIGHT}" fill="url(#glow)"/>
${mark(64, 40, 44, C.ink)}
${text("MITOSHI", 112, 76, 24, C.ink, sora)}
${sender ? text(`FOR ${sender}`, 64, 136, 19, C.ink) : ""}
${text("YOUR CALL HAS A RECEIPT", 64, 170, 16, C.accent)}
${text(title, 60, 250, titleSize, C.ink, sora)}
${contextLines.map((line, i) => text(line, 64, 310 + i * 33, 27, C.ink)).join("\n")}
${detailLines.map((line, i) => text(line, 64, 388 + i * 29, 22, C.soft)).join("\n")}
${text(state.footer, 64, 462, 20, C.soft)}
${tx ? text(tx, 64, 500, Math.min(15, 660 / width(inter, tx, 1)), C.soft) : ""}
${receiptArt(status)}
<path d="M64 528H1136" stroke="${C.rule}"/>
${text(`${site} · Details in the reply`, 64, 566, 15, C.soft)}
${text(banner, 1136 - width(inter, banner, 15), 566, 15, C.accent)}
</svg>`;
}

/** A deterministic PNG, ready for the transport's upload; the renderer itself never posts or uploads. */
export async function renderReplyCardPng(input: ReplyCardInput, options: ReplyCardOptions = {}): Promise<Buffer> {
  return sharp(Buffer.from(renderReplyCardSvg(input, options))).png({ compressionLevel: 9 }).toBuffer();
}
