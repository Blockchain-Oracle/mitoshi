/**
 * RedStone print archive (plan S0.11, C.4.4). The gateway keeps ≈ 24 h of signed packages, so every 5-minute
 * boundary T is fetched shortly after it passes and stored with its signatures. Unlike the laptop archiver it replaces
 * (stocklana `scripts/archive/redstone.mjs`, which followed the NYSE calendar via Alpaca), this runs around the clock:
 * crypto and the 24/7 and pre/after stock feeds are live off-hours, and the weekend Gap needs Friday's close and
 * Monday's open. A 10-second grid around 09:30 ET keeps the open-print evidence. The fetch goes through the process's
 * gateways (authenticated with `REDSTONE_GATEWAYS`, D-210), as every other RedStone read in ops does.
 */
import { fetchRedstoneAt, redstoneAnswerName, type RedstoneGateway } from "../../prices/redstone-gateway";

export const SERVICE = "redstone-primary-prod";
export const NAMES = ["TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "PLTR", "AMD"] as const;
const STOCK_FEEDS = NAMES.flatMap((n) => [n, `${n}---EXTENDED`, `${n}---24_7`, `${n}---PRE_AFTER`]);
export const FEEDS = [...STOCK_FEEDS, "BTC", "ETH", "SOL", "XAU", "NY_MARKET_NEXT_CHANGE_TIME"];
export const STEP_SEC = 300;
export const FETCH_DELAY_SEC = 15;
/** Stay inside the gateway's ≈ 24 h history when backfilling. */
export const RETENTION_SEC = 23 * 3600;

interface Package { timestampMilliseconds: number; signerAddress: string; dataPoints?: { value?: number }[] }
export type Snapshot = { tSec: number; complete: boolean; summary: Record<string, { signers: number; values: (number | undefined)[] }>; feeds: Record<string, Package[]> };

/** Seconds offset of America/New_York from UTC at `date` (DST-aware, no library). */
function nyOffsetSec(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 1000);
}

/** Boundaries to fetch in (fromSec, toSec]: every 5 minutes plus a 10 s grid 09:29–09:31 ET on weekdays. */
export function boundaries(fromSec: number, toSec: number): number[] {
  const out = new Set<number>();
  for (let t = Math.floor(fromSec / STEP_SEC) * STEP_SEC + STEP_SEC; t <= toSec; t += STEP_SEC) out.add(t);
  for (let day = Math.floor(fromSec / 86400) - 1; day <= Math.floor(toSec / 86400) + 1; day++) {
    const noonUtc = new Date(day * 86400_000 + 12 * 3600_000);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(noonUtc);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const openSec = day * 86400 + 9 * 3600 + 30 * 60 - nyOffsetSec(noonUtc);
    for (let t = openSec - 60; t <= openSec + 60; t += 10) if (t > fromSec && t <= toSec) out.add(t);
  }
  return [...out].sort((a, b) => a - b);
}

/** The packages for our feeds signed exactly at T; `complete` = every stock name and crypto has ≥ 3 signers. */
export function pick(all: Record<string, Package[]>, tSec: number): Snapshot {
  const feeds: Snapshot["feeds"] = {};
  const summary: Snapshot["summary"] = {};
  for (const id of FEEDS) {
    const packages = (all[id] ?? []).filter((p) => p.timestampMilliseconds === tSec * 1000);
    feeds[id] = packages;
    summary[id] = { signers: new Set(packages.map((p) => p.signerAddress)).size, values: packages.map((p) => p.dataPoints?.[0]?.value) };
  }
  const core = [...NAMES, "BTC", "ETH", "SOL"];
  return { tSec, complete: core.every((id) => (summary[id]?.signers ?? 0) >= 3), summary, feeds };
}

/**
 * Fetches T from the gateways; null when the answer has nothing yet (retry on a later pass). Throws when no gateway
 * answers (a refusal, or T not served yet), naming the gateway's reason, so the pass reports it instead of "up to date".
 */
export async function fetchSnapshot(tSec: number, gateways: readonly RedstoneGateway[]): Promise<{ snap: Snapshot; via: string } | null> {
  const response = await fetchRedstoneAt(tSec, gateways, 30_000);
  const all = JSON.parse(response.text) as Record<string, Package[]>;
  if (!all || typeof all !== "object" || !all.BTC) return null;
  return { snap: pick(all, tSec), via: redstoneAnswerName(response) };
}
