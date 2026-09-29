// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/calendar/earnings.ts
/**
 * The earnings calendar (plan C.5.2 earnings): Finnhub `/calendar/earnings` for each registry stock, 14 days ahead,
 * once per 6 h, into `deps.events.setEarnings`. `/session.earnings` stays null ("unknown", never "none") until every
 * stock was read in one round; a failed round keeps the last good calendar. One call per stock (the unfiltered calendar
 * caps at 1,500 rows in reporting season), 3 s apart, stopping a round on HTTP 429. The key rides only in the
 * `X-Finnhub-Token` header.
 */
import { EARNINGS_SYMBOLS, earningsRange, parseFinnhubEarnings, type EarningsEvent, type TickerSymbol } from "@cwf/core";
import { errorText, runActor, type VenueDeps } from "../runtime";

const PASS_MS = 6 * 60 * 60_000;
const RETRY_MS = 15 * 60_000;
const CALL_GAP_MS = 3_000;
const BASE_URL = "https://finnhub.io/api/v1/calendar/earnings";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Read = { ok: true; events: EarningsEvent[] } | { ok: false; why: string; limited: boolean };

async function readSymbol(symbol: TickerSymbol, from: string, to: string, key: string): Promise<Read> {
  try {
    const res = await fetch(`${BASE_URL}?${new URLSearchParams({ symbol, from, to })}`, { headers: { "X-Finnhub-Token": key }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { ok: false, why: `${symbol} HTTP ${res.status}`, limited: res.status === 429 };
    const events = parseFinnhubEarnings(await res.json(), [symbol]);
    return events ? { ok: true, events } : { ok: false, why: `${symbol} unexpected body`, limited: false };
  } catch (error) {
    return { ok: false, why: `${symbol} ${errorText(error)}`, limited: false };
  }
}

const describe = (e: EarningsEvent) => `${e.symbol} ${e.dateEt.slice(5)}${e.hour ? ` ${e.hour}` : ""}`;

export function startEarnings(deps: VenueDeps): { stop: () => void } {
  const pass = async () => {
    const key = process.env.FINNHUB_API_KEY?.trim();
    if (!key) return { why: "paused: FINNHUB_API_KEY missing (earnings unknown)" };
    const { from, to } = earningsRange(Math.floor(Date.now() / 1000));
    const events: EarningsEvent[] = [];
    const failures: string[] = [];
    for (const [i, symbol] of EARNINGS_SYMBOLS.entries()) {
      if (i > 0) await sleep(CALL_GAP_MS);
      const read = await readSymbol(symbol, from, to, key);
      if (read.ok) events.push(...read.events);
      else failures.push(read.why);
      if (!read.ok && read.limited) break;
    }
    if (failures.length > 0) {
      const kept = deps.events.earnings();
      return { why: `earnings ${from}..${to}: read failed (${failures.join(", ")}); ${kept === null ? "earnings stay unknown" : `keeping the last calendar (${kept.length} reports)`}; retry in 15 min`, nextDelayMs: RETRY_MS, detail: { from, to, failures } };
    }
    events.sort((a, b) => a.dateEt.localeCompare(b.dateEt) || a.symbol.localeCompare(b.symbol));
    deps.events.setEarnings(events);
    deps.bus.publish("session", "earnings", events);
    return { why: `earnings ${from}..${to}: ${events.length} report(s) for ${EARNINGS_SYMBOLS.length} stocks: ${events.length ? events.map(describe).join(", ") : "none"}`, detail: { from, to, events } };
  };
  return runActor({ name: "earnings", log: deps.log, dryRun: false, everyMs: PASS_MS, pass });
}
