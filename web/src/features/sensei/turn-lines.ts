// Ported from Agari 03b30ab:web/src/features/sensei/turn-lines.ts (S13 step 8) — the session, record, positions and
// earnings lines kept; the holdings, basket and desk lines are Agari's products and have no Mitoshi counterpart; the
// Window lines name the lane and price each side from the book. Pure strings, so the block can be measured: it rides
// on every turn and stays under 2.5 KB with eight positions, eight Windows and ten reports.
import type { SenseiEarnings, SenseiPosition, SenseiRecord, SenseiRequest, SenseiSession } from "./protocol";

const WHOLE_DOLLARS_FROM = 1_000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const REPORT_HOUR = { bmo: " before the open", amc: " after the close", dmh: " during market hours" } as const;
const LANE = { regular: "session", gap: "weekend Gap", stock24: "24/7", crypto24: "24/7" } as const;
const VIA = { wallet: "", vault: " on the Trading Balance", boost: " as a Boost", paper: " on paper (demo)" } as const;

/** "$1,234" from $1,000 up, "$251.37" below. */
export function usdText(usd: number): string {
  return `$${usd.toLocaleString("en-US", usd < WHOLE_DOLLARS_FROM ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
}

export const centsText = (cents: number): string => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isOpen = (s: SenseiSession) => s.state === "regular" || s.state === "early-close";
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** "NYSE session: open, closes 16:00 ET." · "NYSE closed, opens Mon 09:30 ET." · halted · unreadable. */
export function sessionLine(session: SenseiSession | null): string {
  if (session === null) return "The NYSE session could not be read this turn. Do not guess market hours.";
  if (session.state === "halted") return `NYSE session: trading halted (${session.label}). No new session Window opens until it resumes.`;
  if (isOpen(session)) return `NYSE session: open, ${lowerFirst(session.label)}.`;
  return `NYSE session: closed, ${lowerFirst(session.label)}. Crypto and the 24/7 stock lanes keep running.`;
}

export function recordLine({ settled, wins, losses, streak }: SenseiRecord): string {
  if (settled === 0) return "Their record: no settled rounds yet.";
  const n = (k: number) => (k === 1 ? "one" : String(k));
  const run = streak < 0 ? `, and lost the last ${n(-streak)}` : streak > 0 ? `, and won the last ${n(streak)}` : "";
  return `Their record: ${settled} settled, ${wins} won, ${losses} lost${run}.`;
}

export function positionLines(positions: readonly SenseiPosition[]): string[] {
  if (positions.length === 0) return ["Their open positions, just read: none."];
  return [
    "Their open positions, just read:",
    ...positions.map((p) => `- ${p.asset} ${p.cadence} ${p.side.toUpperCase()}${VIA[p.via]}, staked ${centsText(p.stakeCents)}, ${p.markCents === null ? "Close can't price it right now" : `Close pays ${centsText(p.markCents)} now`}, closes in ${p.minsToClose} min`),
  ];
}

const reportDay = (dateEt: string) => `${DAY_NAMES[new Date(`${dateEt}T12:00:00Z`).getUTCDay()]} ${dateEt.slice(5)}`;

/** "Earnings ahead: TSLA reports Wed 10-22 after the close." */
export function earningsLine(events: readonly SenseiEarnings[] | null): string {
  if (events === null) return "The earnings calendar could not be read this turn. Do not guess report dates.";
  if (events.length === 0) return "No earnings report ahead for the stocks on screen.";
  const sorted = [...events].sort((a, b) => a.dateEt.localeCompare(b.dateEt));
  return `Earnings ahead: ${sorted.map((e) => `${e.symbol} reports ${reportDay(e.dateEt)}${e.hour ? REPORT_HOUR[e.hour] : ""}`).join("; ")}.`;
}

/** The live prices and Windows, or why there are none. */
export function windowLines(snapshot: SenseiRequest["snapshot"], session: SenseiSession | null): string[] {
  if (snapshot === null || snapshot.windows.length === 0) {
    const closed = session !== null && session.state !== "halted" && !isOpen(session);
    const prices = snapshot && Object.keys(snapshot.prices).length ? ` Prices, just read: ${Object.entries(snapshot.prices).map(([a, p]) => `${a} ${usdText(p)}`).join(", ")}.` : "";
    return [
      (closed
        ? "No Window on screen is open for calls right now. If they ask about a stock's session Window, say the session is closed and when it opens; the 24/7 lanes may still run."
        : "No live Window was provided this turn. Say so plainly rather than guessing at a read.") + prices,
    ];
  }
  const lines = [`Live prices, just read: ${Object.entries(snapshot.prices).map(([a, p]) => `${a} ${usdText(p)}`).join(", ") || "none available"}.`, "Live Windows, just read:"];
  for (const w of snapshot.windows) {
    const line = w.lineUsd === null ? "no opening print yet" : `line ${usdText(w.lineUsd)}`;
    const up = w.upCents === null ? "UP unquoted" : `UP ${w.upCents}c`;
    const down = w.downCents === null ? "DOWN unquoted" : `DOWN ${w.downCents}c`;
    lines.push(`- ${w.asset} ${w.cadence} ${LANE[w.lane]}, closes in ${w.minsToClose} min, ${line}, ${up}, ${down}`);
  }
  lines.push("Those cent figures are what one contract of that side costs right now, read from the book; each pays $1 if right.");
  return lines;
}
