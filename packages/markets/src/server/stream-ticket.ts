/**
 * The per-user stream ticket (D-049): the web mints it from a signed-in session (`/api/stream/ticket`), ops verifies it
 * on `GET /v1/stream?ticket=…` (EventSource can't send headers). Format `<address>.<expSec>.<hmacHex>` with
 * `hmac = HMAC-SHA256(STREAM_TICKET_SECRET, "cwf-stream:<lowercase address>:<expSec>")`; valid for 60 s. It grants
 * only the `user:<address>` topic of that address. Server-only (node:crypto).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const STREAM_TICKET_TTL_SEC = 60;

const mac = (secret: string, address: string, expSec: number) => createHmac("sha256", secret).update(`cwf-stream:${address.toLowerCase()}:${expSec}`).digest("hex");

export function mintStreamTicket(secret: string, address: string, nowSec: number, ttlSec = STREAM_TICKET_TTL_SEC): { ticket: string; expSec: number } {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("ticket needs a 0x address");
  const expSec = nowSec + Math.min(ttlSec, STREAM_TICKET_TTL_SEC);
  return { ticket: `${address.toLowerCase()}.${expSec}.${mac(secret, address, expSec)}`, expSec };
}

/** The lowercase address the ticket grants, or null when malformed, forged or expired. */
export function verifyStreamTicket(secret: string, ticket: string, nowSec: number): string | null {
  const m = /^(0x[0-9a-f]{40})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(ticket);
  if (!m) return null;
  const [, address, exp, sig] = m as unknown as [string, string, string, string];
  const expSec = Number(exp);
  if (expSec < nowSec || expSec > nowSec + STREAM_TICKET_TTL_SEC) return null;
  const want = Buffer.from(mac(secret, address, expSec), "hex");
  const got = Buffer.from(sig, "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? address : null;
}
