// Ported from Masayume 68f7a09:packages/core/src/units/display.ts
const SEC_PER_HOUR = 3600;
const SEC_PER_MIN = 60;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `m:ss`, or `h:mm:ss` once an hour or more remains; a negative, fractional or non-finite input reads as whole
 *  seconds from 0 (never "-1:-5" or "NaN:NaN"). */
export function formatClock(sec: number): string {
  const remainingSec = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const hours = Math.floor(remainingSec / SEC_PER_HOUR);
  const minutes = Math.floor((remainingSec % SEC_PER_HOUR) / SEC_PER_MIN);
  const seconds = remainingSec % SEC_PER_MIN;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`;
}

/**
 * Wall-clock `h:mm` for "closes at 3:45" — the word board's own idiom, where a
 * scheduled time reads more naturally than a countdown.
 *
 * Locale-dependent, so it is only ever safe from a mounted clock: every caller
 * gates on `useChainNowMs() > 0`, which is 0 until the first client tick, so the
 * server never renders a time the client would disagree with.
 *
 * Built from the Date's own fields, not Intl: a page's first Intl.DateTimeFormat builds ICU's date-pattern machinery,
 * 63 ms at 4× CPU inside the first /markets card render (F-S23-08; before it, D-181 kept one formatter rather than one
 * per call). The output is en-US's to the character (V8 prints a plain space before the day period).
 */
export function formatWallClock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad2(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
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
