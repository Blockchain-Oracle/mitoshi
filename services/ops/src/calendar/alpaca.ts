// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/calendar/alpaca.ts (+ the asset status read halt-watch uses).
import { calendarFromAlpaca, type SessionCalendar } from "@cwf/core";

const base = (env: NodeJS.ProcessEnv) => (env.ALPACA_ENDPOINT || "https://paper-api.alpaca.markets/v2").replace(/\/+$/, "");

function headers(env: NodeJS.ProcessEnv): Record<string, string> {
  const { ALPACA_KEY_ID, ALPACA_SECRET_KEY } = env;
  if (!ALPACA_KEY_ID || !ALPACA_SECRET_KEY) throw new Error("ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set");
  return { "APCA-API-KEY-ID": ALPACA_KEY_ID, "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY };
}

/** Alpaca `GET /v2/calendar` for `[fromDate, toDate]` (ET dates). Server-only keys; throws on HTTP or shape errors. */
export async function fetchAlpacaCalendar(fromDate: string, toDate: string, env: NodeJS.ProcessEnv = process.env): Promise<SessionCalendar> {
  const res = await fetch(`${base(env)}/calendar?start=${fromDate}&end=${toDate}`, { headers: headers(env), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Alpaca calendar HTTP ${res.status}`);
  return calendarFromAlpaca(await res.json(), fromDate, toDate);
}

/** Alpaca `GET /v2/assets/{symbol}` → the exchange's `tradable` flag (the `exchange-halt` signal); null when unreadable. */
export async function fetchAlpacaTradable(symbol: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean | null> {
  const res = await fetch(`${base(env)}/assets/${encodeURIComponent(symbol)}`, { headers: headers(env), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { tradable?: unknown; status?: unknown };
  return typeof body.tradable === "boolean" ? body.tradable && body.status === "active" : null;
}
