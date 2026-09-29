// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/runtime/session-events.ts (xStock
// multipliers → the stock-token mirror's multiplier, keyed by ticker; lanes regular/gap/stock24/crypto24).
/**
 * Session events every venue actor shares: corporate skips and multiplier changes from `config/corporate-actions.json`
 * (re-read when the file changes) and the earnings calendar, which only the `earnings` actor writes.
 */
import { readFileSync, statSync } from "node:fs";
import { isStockSymbol, isTickerSymbol, type CorporateSkip, type EarningsEvent, type LaneBasis, type MultiplierChange } from "@cwf/core";

const CORPORATE_ACTIONS = new URL("../../config/corporate-actions.json", import.meta.url);
const LANES: readonly string[] = ["regular", "gap", "stock24", "crypto24"] satisfies LaneBasis[];
const ET_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d+(\.\d+)?$/;

export interface SessionEvents {
  skips(): readonly CorporateSkip[];
  multipliers(): readonly MultiplierChange[];
  /** Null until the first successful earnings fetch: a surface then shows no earnings flag rather than "none". */
  earnings(): readonly EarningsEvent[] | null;
  setEarnings(events: readonly EarningsEvent[]): void;
  problems(): readonly string[];
}

type Parsed = { skips: CorporateSkip[]; multipliers: MultiplierChange[]; problems: string[] };

function parseSkip(raw: unknown): CorporateSkip | null {
  const r = raw as Partial<Record<keyof CorporateSkip, unknown>>;
  if (!isTickerSymbol(r?.symbol) || typeof r.date !== "string" || !ET_DATE.test(r.date) || typeof r.why !== "string") return null;
  if (r.lanes !== undefined && !(Array.isArray(r.lanes) && r.lanes.every((l) => LANES.includes(l)))) return null;
  return { symbol: r.symbol, date: r.date, why: r.why, ...(r.lanes ? { lanes: r.lanes as LaneBasis[] } : {}) };
}

function parseMultiplier(raw: unknown): MultiplierChange | null {
  const r = raw as Partial<Record<keyof MultiplierChange, unknown>>;
  if (!isStockSymbol(r?.symbol) || !Number.isInteger(r.effectiveSec) || typeof r.why !== "string") return null;
  if (typeof r.from !== "string" || !DECIMAL.test(r.from) || typeof r.to !== "string" || !DECIMAL.test(r.to)) return null;
  return { symbol: r.symbol, effectiveSec: r.effectiveSec as number, from: r.from, to: r.to, why: r.why };
}

export function parseCorporateActions(text: string): Parsed {
  const json = JSON.parse(text) as { skips?: unknown[]; multipliers?: unknown[] };
  const out: Parsed = { skips: [], multipliers: [], problems: [] };
  for (const [i, raw] of (json.skips ?? []).entries()) {
    const skip = parseSkip(raw);
    if (skip) out.skips.push(skip);
    else out.problems.push(`skips[${i}] malformed`);
  }
  for (const [i, raw] of (json.multipliers ?? []).entries()) {
    const change = parseMultiplier(raw);
    if (change) out.multipliers.push(change);
    else out.problems.push(`multipliers[${i}] malformed`);
  }
  return out;
}

export function createSessionEvents(file: URL = CORPORATE_ACTIONS): SessionEvents {
  let parsed: Parsed = { skips: [], multipliers: [], problems: [] };
  let mtimeMs = -1;
  let earnings: readonly EarningsEvent[] | null = null;
  const current = (): Parsed => {
    try {
      const stat = statSync(file);
      if (stat.mtimeMs !== mtimeMs) {
        parsed = parseCorporateActions(readFileSync(file, "utf8"));
        mtimeMs = stat.mtimeMs;
      }
    } catch (error) {
      parsed = { ...parsed, problems: [`corporate-actions.json: ${error instanceof Error ? error.message : String(error)}`] };
    }
    return parsed;
  };
  return {
    skips: () => current().skips,
    multipliers: () => current().multipliers,
    earnings: () => earnings,
    setEarnings(events) {
      earnings = [...events];
    },
    problems: () => current().problems,
  };
}
