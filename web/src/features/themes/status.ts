// Whether a theme is calling now (D-231). A basket trades its stocks' own Windows, so its state is the market's: a
// market-hours basket is live in the NYSE session and closed outside it ("Market closed · trades in 14h 20m", from
// ops' session clock); a 24/7 basket trades on RedStone's 24/7 feed whatever the session. Nothing waits on the
// retired guard any more — its states left with the pools. Pure.
import type { BasketLanes } from "@cwf/core";
import { THEMES } from "./copy";
import { untilText } from "./format";

/** Ops' session clock, as `/session` answers it. */
export interface MarketClock {
  open: boolean;
  nextOpenSec: number | null;
}

export type ThemeStatus = { kind: "live"; allHours: boolean } | { kind: "closed"; opensAtSec: number | null } | { kind: "unknown" };

export function themeStatus(lanes: BasketLanes, clock: MarketClock | null): ThemeStatus {
  if (lanes !== "regular") return { kind: "live", allHours: true };
  if (!clock) return { kind: "unknown" };
  return clock.open ? { kind: "live", allHours: false } : { kind: "closed", opensAtSec: clock.nextOpenSec };
}

const S = THEMES.status;

/** The pill's word and tone, and a closed theme's one line; null where there is nothing honest to say. */
export function statusWords(status: ThemeStatus, nowSec: number): { pill: string | null; tone: "live" | "closed" | null; closed: string | null; opensIn: string | null } {
  if (status.kind === "live") return { pill: status.allHours ? S.allHours : S.live, tone: "live", closed: null, opensIn: null };
  if (status.kind === "unknown") return { pill: null, tone: null, closed: null, opensIn: null };
  const opensIn = status.opensAtSec !== null && status.opensAtSec > nowSec ? untilText(status.opensAtSec, nowSec) : null;
  return { pill: S.closed, tone: "closed", closed: opensIn ? S.closedLine(opensIn) : S.closedSoon, opensIn };
}

/** Ops' `/session` body → the clock (`regular` is the only state a market-hours Window lists in). */
export function clockOf(body: unknown): MarketClock | null {
  if (!body || typeof body !== "object") return null;
  const status = (body as { status?: { state?: unknown; nextOpenSec?: unknown } }).status;
  if (!status || typeof status.state !== "string") return null;
  return { open: status.state === "regular", nextOpenSec: typeof status.nextOpenSec === "number" ? status.nextOpenSec : null };
}
