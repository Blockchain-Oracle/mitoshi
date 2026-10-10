#!/usr/bin/env -S pnpm exec tsx
// Ported from Agari 03b30ab:scripts/drive/corporate-check.ts (S6, G-08) — the multiplier source is Robinhood's own
// ERC-8056 on the bridged Stock Tokens (ST-05: what our `ScaledUIView` mirrors) instead of xStocks' API.
/**
 * Corporate-action proposer: prints `services/ops/config/corporate-actions.json` entries for a person to review and
 * commit. It NEVER writes the file. Reads (no signing):
 * - each bridged Stock Token on Robinhood Chain (testnet: the faucet's five, hard-coded as `Tickers.sol` keeps them —
 *   the testnet is full of look-alikes, context/tempo/14 §2.2): `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()`.
 *   A pending change becomes a `multipliers[]` entry (the 24/7 lane skips the Window it lands in) and a proposed skip
 *   of the Regular and Gap lanes on its ET date, since ERC-8056 carries no reason: a person decides whether it is a split;
 * - Finnhub `GET /stock/split` (header key) for every registry stock, 3 s apart; the free key answers 403, which ends
 *   that source for the run and says so.
 * Multipliers stay exact decimal text from the 1e18 integer (never a float). Keys are presence-only in the output.
 *
 *   pnpm --dir scripts exec tsx drive/corporate-check.ts [--days 60] [--no-finnhub] [--rpc https://rpc.testnet.chain.robinhood.com]
 */
import { readFileSync } from "node:fs";
import { addDays, etDateOf, isStockSymbol, STOCK_SYMBOLS, type CorporateSkip, type MultiplierChange } from "@cwf/core";
import { createPublicClient, http, parseAbi, type Address } from "viem";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const FILE = new URL("../../services/ops/config/corporate-actions.json", import.meta.url);
const RPC = arg("--rpc", process.env.RH_TESTNET_RPC_HTTP_URL ?? "https://rpc.testnet.chain.robinhood.com");
const FINNHUB = "https://finnhub.io/api/v1/stock/split";
const days = Number(arg("--days", "60"));
const nowSec = Math.floor(Date.now() / 1000);
const today = etDateOf(nowSec);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Robinhood Chain testnet Stock Tokens (contracts/script/stocks/Tickers.sol `rhTestnetStock`). */
const RH_TESTNET: Record<string, Address> = {
  TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
  AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
  PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
  NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
  AMD: "0x71178BAc73cBeb415514eB542a8995b82669778d",
};
const ERC8056 = parseAbi(["function uiMultiplier() view returns (uint256)", "function newUIMultiplier() view returns (uint256)", "function effectiveAt() view returns (uint256)"]);
const client = createPublicClient({ transport: http(RPC) });

/** 1e18 fixed point → exact decimal text ("1", "2.5", "1.0017152487959897"). */
export function wadText(wad: bigint): string {
  const whole = wad / 10n ** 18n;
  const frac = (wad % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

type Current = { skips?: CorporateSkip[]; multipliers?: MultiplierChange[] };
const current = JSON.parse(readFileSync(FILE, "utf8")) as Current;
const proposedSkips: CorporateSkip[] = [];
const proposedMultipliers: MultiplierChange[] = [];
const notes: string[] = [];

async function robinhoodMultiplier(symbol: string, token: Address): Promise<void> {
  const read = (functionName: "uiMultiplier" | "newUIMultiplier" | "effectiveAt") => client.readContract({ address: token, abi: ERC8056, functionName });
  const got = await Promise.all([read("uiMultiplier"), read("newUIMultiplier"), read("effectiveAt")]).catch((e: unknown) => e);
  if (!Array.isArray(got)) return void notes.push(`Robinhood ${symbol} ${token}: unreadable (${String(got).split("\n")[0]})`);
  const [now, next, at] = got as [bigint, bigint, bigint];
  const effectiveSec = Number(at);
  if (effectiveSec === 0 || next === now) return void notes.push(`Robinhood ${symbol}: multiplier ${wadText(now)}, nothing pending`);
  if (effectiveSec < nowSec - 3 * 86_400) return void notes.push(`Robinhood ${symbol}: last change ${new Date(effectiveSec * 1000).toISOString()} already applied (${wadText(next)})`);
  const why = `${symbol} multiplier ${wadText(now)} → ${wadText(next)} at ${new Date(effectiveSec * 1000).toISOString()} (Robinhood ERC-8056)`;
  if (!isStockSymbol(symbol)) return void notes.push(`${why}: ${symbol} lists no Windows here, nothing to skip`);
  proposedMultipliers.push({ symbol, effectiveSec, from: wadText(now), to: wadText(next), why });
  proposedSkips.push({ symbol, date: etDateOf(effectiveSec), why: `${why} — review: a split moves the Regular and Gap prints`, lanes: ["regular", "gap"] });
}

async function finnhubSplits(): Promise<void> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return void notes.push("Finnhub: FINNHUB_API_KEY missing, skipped");
  const range = { from: addDays(today, -3), to: addDays(today, days) };
  for (const [i, symbol] of STOCK_SYMBOLS.entries()) {
    if (i > 0) await sleep(3_000);
    const res = await fetch(`${FINNHUB}?${new URLSearchParams({ symbol, ...range })}`, { headers: { "X-Finnhub-Token": key }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (res?.status === 403 || res?.status === 401) return void notes.push(`Finnhub /stock/split: HTTP ${res.status} on this key (not in the free tier); split skips come from Robinhood's multipliers only`);
    if (!res?.ok) return void notes.push(`Finnhub /stock/split ${symbol}: ${res ? `HTTP ${res.status}` : "unreachable"}; stopped`);
    const rows = (await res.json()) as Array<{ symbol?: string; date?: string; fromFactor?: number; toFactor?: number }>;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row.symbol !== symbol || !row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
      proposedSkips.push({ symbol, date: row.date, why: `${row.toFactor}-for-${row.fromFactor} split (Finnhub)` });
    }
  }
}

for (const [symbol, token] of Object.entries(RH_TESTNET)) await robinhoodMultiplier(symbol, token);
if (!process.argv.includes("--no-finnhub")) await finnhubSplits();

const known = (s: CorporateSkip) => (current.skips ?? []).some((k) => k.symbol === s.symbol && k.date === s.date);
const knownM = (m: MultiplierChange) => (current.multipliers ?? []).some((k) => k.symbol === m.symbol && k.effectiveSec === m.effectiveSec);
const skips = proposedSkips.filter((s) => !known(s));
const multipliers = proposedMultipliers.filter((m) => !knownM(m));

console.log(`corporate-check at ${new Date(nowSec * 1000).toISOString()} (ET ${today}, +${days} days); RPC ${RPC}; FINNHUB_API_KEY present: ${Boolean(process.env.FINNHUB_API_KEY)}`);
for (const note of notes) console.log(`  - ${note}`);
console.log(`already in corporate-actions.json: ${proposedSkips.length - skips.length} skip(s), ${proposedMultipliers.length - multipliers.length} multiplier(s)`);
if (skips.length === 0 && multipliers.length === 0) console.log("nothing to propose");
else console.log(`proposed additions (review, then add by hand to services/ops/config/corporate-actions.json):\n${JSON.stringify({ skips, multipliers }, null, 2)}`);
