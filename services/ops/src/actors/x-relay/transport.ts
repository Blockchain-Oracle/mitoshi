// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/transport.ts — plus the read blocks Mitoshi's two ways in
// can hit (S11, D-227): the X API's empty pay-per-use balance (402) and a refused account session.
import type { XReadBlock, XReadVia } from "@cwf/core";

/** One mention of the bot, as the relay reads it: who said what, when, and the post's own id. */
export interface Mention {
  id: string;
  authorId: string;
  handle: string | null;
  text: string;
  createdAtMs: number;
  /**
   * A repost (X's retweet) carries the original's words under a new id and its reposter as author: never a call of its
   * own, or one call would be placed again by anyone — the author included — who reposts it (S11 review, D-227).
   */
  repost?: boolean;
}

export interface XTransport {
  via: Exclude<XReadVia, "none">;
  /** One line for the boot log: which way, and as whom. */
  describe(): string;
  /** The bot account's stable id, checked against the configured handle before any poll. */
  authenticatedAuthorId(): Promise<string>;
  /** Mentions newer than `sinceId`, oldest first; `null` asks for the newest only (the first poll draws the line). */
  fetchMentions(sinceId: string | null): Promise<Mention[]>;
  /** The earliest time X's budget allows the next read (epoch ms); absent, any time. */
  readyAtMs?: () => number;
  /** Upload only — never posts or executes anything. Absent when this way in can't upload (the reply goes as text). */
  uploadImage?: (png: Uint8Array) => Promise<string>;
  /** One POST under the mention, with the uploaded card when given; no retries after an ambiguous answer. Null when this way in can't post. */
  reply: ((mentionId: string, text: string, mediaId?: string) => Promise<string | null>) | null;
}

/** X refused the read in a way only a person can fix (credits, a dead session): the relay says so and waits. */
export class XReadBlockedError extends Error {
  constructor(readonly block: XReadBlock, detail: string) {
    super(`X read blocked (${block}): ${detail}`);
    this.name = "XReadBlockedError";
  }
}

/** The read was refused for rate: the transport has moved its next allowed read. */
export class XRateLimitedError extends Error {
  constructor(readonly retryAtMs: number) {
    super(`X rate-limited the mention read until ${new Date(retryAtMs).toISOString()}`);
    this.name = "XRateLimitedError";
  }
}

/** X answered the reply POST with a refusal: nothing was published, so it is not an ambiguous send. */
export class XRefusedError extends Error {
  constructor(readonly code: string, detail: string) {
    super(`X refused the reply (${code}): ${detail}`);
    this.name = "XRefusedError";
  }
}
