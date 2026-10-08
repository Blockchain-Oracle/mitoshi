// Ported from Masayume 68f7a09:packages/core/src/units/display.ts
const SEC_PER_HOUR = 3600;
const SEC_PER_MIN = 60;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `m:ss`, or `h:mm:ss` once an hour or more remains. */
export function formatClock(remainingSec: number): string {
  const hours = Math.floor(remainingSec / SEC_PER_HOUR);
  const minutes = Math.floor((remainingSec % SEC_PER_HOUR) / SEC_PER_MIN);
  const seconds = remainingSec % SEC_PER_MIN;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`;
}

let wallClock: Intl.DateTimeFormat | undefined;

/**
 * Wall-clock `h:mm` for "closes at 3:45" — the word board's own idiom, where a
 * scheduled time reads more naturally than a countdown.
 *
 * Locale-dependent, so it is only ever safe from a mounted clock: every caller
 * gates on `useChainNowMs() > 0`, which is 0 until the first client tick, so the
 * server never renders a time the client would disagree with.
 */
export function formatWallClock(ms: number): string {
  // One formatter for every call: `toLocaleTimeString(locale, options)` builds a new Intl.DateTimeFormat each time, the
  // costliest line of a board re-render (D-181). Same locale, same options, same output.
  wallClock ??= new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  return wallClock.format(ms);
}

export function shortHex(hex: string, lead = 6, tail = 4): string {
  return hex.length <= lead + tail + 1 ? hex : `${hex.slice(0, lead)}…${hex.slice(-tail)}`;
}

export interface FormatUtcOptions {
  withSeconds?: boolean;
  withDate?: boolean;
}

/** Absolute UTC for anything screenshotable — never a relative time that goes stale in an image. */
export function formatUtc(ms: number, { withSeconds = true, withDate = false }: FormatUtcOptions = {}): string {
  const iso = new Date(ms).toISOString();
  const time = withSeconds ? iso.slice(11, 19) : iso.slice(11, 16);
  return withDate ? `${iso.slice(0, 10)} ${time} UTC` : `${time} UTC`;
}
