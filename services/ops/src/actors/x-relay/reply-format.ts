// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/reply-format.ts — S11 (D-227): Mitoshi's words, Tempo's
// explorer for the proof link, and one presentation that both the text reply and the card (`reply-card.ts`) draw from,
// so the image can never say something the text doesn't.
import { formatBaseUnits, formatCadence, NETWORK_LABEL, txUrl, X_RECEIPT_STATUSES, xRefusalCopy, xReceiptRecovery, type Network, type XReceipt, type XReceiptStatus } from "@cwf/core";

export const REPLY_LIMIT = 280;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const BASE = /^(0|[1-9]\d{0,77})$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** Every fact a reply states, validated once: the text and the card are both drawn from this. */
export interface ReplyPresentation {
  status: XReceiptStatus;
  title: string;
  /** "BTC / UP / 5m / ends 14:05 UTC"; null when the receipt names no market. */
  context: string | null;
  detail: string | null;
  /** "Tempo Moderato testnet". */
  network: string;
  url: string;
  /** "testnet.mitoshi.xyz". */
  site: string;
  /** "@caller"; null when X gave no usable handle. */
  sender: string | null;
  txHash: `0x${string}` | null;
}

function usd(value: string | null | undefined): string | null {
  return typeof value === "string" && BASE.test(value) ? `$${formatBaseUnits(BigInt(value), 6, { minDp: 2, maxDp: 6 })}` : null;
}

function context(r: XReceipt): string | null {
  const asset = typeof r.asset === "string" && /^[A-Z]{2,6}$/.test(r.asset) ? r.asset : null;
  const side = r.side === "up" ? "UP" : r.side === "down" ? "DOWN" : null;
  const cadence = typeof r.intervalSec === "number" && r.intervalSec > 0 ? formatCadence(r.intervalSec) : null;
  const ends = typeof r.expirySec === "number" && r.expirySec > 0 ? `ends ${new Date(r.expirySec * 1000).toISOString().slice(11, 16)} UTC` : null;
  const line = [asset, side, cadence, ends].filter(Boolean).join(" / ");
  return line || null;
}

/** Only validated receipt facts and fixed copy: a fill is claimed only with its transaction hash. */
export function replyPresentation(r: XReceipt, network: Network, site: string): ReplyPresentation {
  const hash = typeof r.txHash === "string" && HASH.test(r.txHash) ? (r.txHash as `0x${string}`) : null;
  let status: XReceiptStatus = X_RECEIPT_STATUSES.includes(r.status) ? r.status : "unknown";
  if (!hash && (status === "filled" || status === "nothing-filled" || status === "reverted")) status = "unknown";
  const recovery = status === "refused" ? xReceiptRecovery(r.refusalCode) : null;
  const url = hash ? txUrl(hash, network) : `${site}${recovery?.href ?? "/trade-from-x"}`;
  const where = context(r);
  const [title, detail]: [string, string | null] =
    status === "filled" ? ["Filled", usd(r.bookedCostBase) ? `Spent ${usd(r.bookedCostBase)}.` : null]
    : status === "nothing-filled" ? ["No fill", "Nothing was booked."]
    : status === "reverted" ? ["Reverted", "Nothing was booked."]
    : status === "refused" ? (() => { const c = xRefusalCopy(r); return [c.title, c.detail] as [string, string]; })()
    : ["Needs checking", "Check the app before trying again."];
  return {
    status, title, context: where, detail, network: NETWORK_LABEL[network], url, site: site.replace(/^https?:\/\//, ""),
    sender: typeof r.handle === "string" && HANDLE.test(r.handle) ? `@${r.handle}` : null, txHash: hash,
  };
}

/** The reply's text: ASCII, within 280, the link always last. */
export function replyTextOf(p: ReplyPresentation): string {
  let text = [p.title, p.context, p.detail, p.network, p.url].filter(Boolean).join("\n");
  if (text.length > REPLY_LIMIT) text = [p.title, p.detail, p.url].filter(Boolean).join("\n");
  return text.replace(/[^\x20-\x7E\n]/g, "-").slice(0, REPLY_LIMIT);
}

export function replyText(r: XReceipt, network: Network, site: string): string {
  return replyTextOf(replyPresentation(r, network, site));
}

/** A reply goes to a linked account's mention, or to anyone's mention that parsed as a call. */
export const isCall = (r: XReceipt): boolean => r.wallet !== null || r.side !== null;
