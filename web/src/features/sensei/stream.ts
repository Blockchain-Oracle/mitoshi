/**
 * Sensei's wire format (S13 step 8): one JSON object per line. The route writes `delta`s as the model's tokens arrive,
 * then `done`, or an `error` in Sensei's own words when the model fails part-way; the client reads lines as they land.
 * Errors before anything streams (no credential, no consent, a bad request, the rate gate) are plain JSON with a status.
 */
/** Bumped whenever what Sensei sends changes, so an older agreement no longer covers it (`consent.ts`, the route). */
export const SENSEI_CONSENT_VERSION = "2026-10-10";

export type SenseiEvent = { t: "delta"; v: string } | { t: "done"; refused?: true } | { t: "error"; m: string };

export const SENSEI_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export const encodeEvent = (e: SenseiEvent): string => `${JSON.stringify(e)}\n`;

/** Splits a growing buffer into whole lines; the unfinished tail is handed back for the next chunk. */
export function takeEvents(buffer: string): { events: SenseiEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: SenseiEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as SenseiEvent;
      if (e && (e.t === "delta" || e.t === "done" || e.t === "error")) events.push(e);
    } catch {
      // a malformed line is skipped; the next one still reads
    }
  }
  return { events, rest };
}
