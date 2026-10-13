// Sensei's read as a card (round 7, the owner's TestFlight review: "I don't like the way you did the Sensei AI"). The
// prompt opens every answer with one protocol line — `LEAN: UP`, `LEAN: DOWN`, `LEAN: SIT` or `LEAN: NONE` — and the
// sheet draws the side as the card's head and the rest as its body. Read while the answer streams: until the first line
// is whole it may be a prefix of the protocol, so it is held back rather than flashed as text. An answer without the
// line (an older thread, a model that skipped it) is plain text.
export type Lean = "up" | "down" | "sit";

export interface LeanSplit {
  /** The side the read takes; null for an answer that isn't a read of a Window. */
  lean: Lean | null;
  /** The words under the head, protocol line removed. */
  body: string;
  /** The first line is still arriving and could still be the protocol line. */
  pending: boolean;
}

const LINE = /^\s*LEAN:\s*(UP|DOWN|SIT|NONE)\b[^\n]*(?:\n|$)/i;
const PROTOCOL = "LEAN:";

export function splitLean(content: string): LeanSplit {
  const match = LINE.exec(content);
  if (match) {
    const word = match[1]!.toLowerCase();
    return { lean: word === "none" ? null : (word as Lean), body: content.slice(match[0].length).trimStart(), pending: false };
  }
  const head = content.trimStart();
  const firstLine = head.split("\n", 1)[0]!;
  // "LEA", "LEAN: D", "LEAN: DOW": a protocol line still being written.
  const partial = !content.includes("\n") && (PROTOCOL.startsWith(firstLine.toUpperCase()) || (firstLine.toUpperCase().startsWith(PROTOCOL) && /^(U|UP|D|DO|DOW|DOWN|S|SI|SIT|N|NO|NON|NONE)?$/i.test(firstLine.slice(PROTOCOL.length).trim())));
  return partial ? { lean: null, body: "", pending: true } : { lean: null, body: content, pending: false };
}
