// S11 (D-227): what the ops x-relay says about itself — on `/health` (its heartbeat detail) and on `/x/relay`, which the
// web's `/api/x/status` reads. Owarine 90a91d71 kept three stage-health rows in Postgres (`xGetRelayHealth`); Mitoshi's
// ops already serves every actor's heartbeat, so the relay's facts ride on its own.

/** How the relay reads the bot's mentions: the account's session (Rettiwt), the official X API, or not at all. */
export type XReadVia = "rettiwt" | "x-api" | "none";

/**
 * Why mentions can't be read, in words the UI and `/health` share:
 * - `credits`: the X API answered 402 — the app's pay-per-use balance is empty (an owner action);
 * - `session`: the account session (Rettiwt key) was refused or unreadable;
 * - `rate-limited`: X's search budget is spent until its reset;
 * - `unconfigured`: no way in is configured;
 * - `error`: anything else (network, X down).
 */
export type XReadBlock = "credits" | "session" | "rate-limited" | "unconfigured" | "error";

export interface XReadState {
  via: XReadVia;
  ok: boolean;
  block: XReadBlock | null;
  /** One line from the last attempt (status codes and X's error words; never a credential). */
  detail: string | null;
  checkedAtMs: number | null;
}

export interface XRelayStatus {
  /** The relay actor runs in this ops process. */
  running: boolean;
  /** Plans and records, signs nothing (`DRY_RUN`, or `X_RELAY_LIVE` unset). */
  dryRun: boolean;
  /** The executor an EXECUTOR grant must name: the relay's key's address. Null without a key. */
  executor: string | null;
  handle: string | null;
  reading: XReadState;
  /** Receipt replies post as the bot only when `X_POSTING_ENABLED=1` and a way to post exists. */
  posting: boolean;
  /** Replies carry the receipt card (posting, `X_REPLY_IMAGES_ENABLED` not off, and a way in that uploads). */
  images: boolean;
  /** Mentions handled since the process started (filled, refused, dry). */
  handled: number;
}

export const X_RELAY_STOPPED: XRelayStatus = {
  running: false, dryRun: true, executor: null, handle: null, posting: false, images: false, handled: 0,
  reading: { via: "none", ok: false, block: "unconfigured", detail: null, checkedAtMs: null },
};

/** A status older than this reads as out of date (three of the relay's slowest passes). */
export const X_RELAY_STALE_MS = 3 * 60_000;
