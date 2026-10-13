/**
 * How long a Window waits before a user can trade it (D-230 items 1–2), read off the chain over the last `--minutes`:
 * per lane and cadence, the opening print's block time against the Window's start (`PrintRecorded`, which = open), and
 * when the book first had both sides (the first PostOnly BUY_YES and BUY_NO placements, `OrderExecuted`) against the
 * start. Also the Windows that never got an opening print and each Series' print policy. Read-only.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/print-latency.ts --minutes 60 [--symbol SOL] [--policy]
 */
import { getAbiItem, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { fetchMarkets, KIND, listSeries, marketIdOf, ORDER_TYPE, type MarketView, type SeriesView } from "@cwf/markets/ops";
import { testnetVenue } from "./lib/live-windows";

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const minutes = Number(arg("minutes", "60"));
const only = arg("symbol", "").toUpperCase() || null;
const STEP = 2_000n;
const PRINT = getAbiItem({ abi: eventsEngineAbi, name: "PrintRecorded" });
const EXECUTED = getAbiItem({ abi: eventsEngineAbi, name: "OrderExecuted" });

const { client, venue } = testnetVenue();
const head = await client.public.getBlock({ blockTag: "latest" });
const nowSec = Number(head.timestamp);
const series = (await listSeries(client, venue)).filter((s) => s.symbol && (!only || s.symbol === only));
const key = (s: SeriesView) => `${s.symbol}/${s.lane}/${s.cadenceSec / 60}m`;

console.log(`head ${head.number} at ${new Date(nowSec * 1000).toISOString()}`);
if (process.argv.includes("--policy")) {
  for (const s of series) {
    const v = s.versions.at(-1)!;
    console.log(`${key(s).padEnd(22)} next #${s.nextIndex} · primary src ${v.primary.source} strict ${v.primary.strictSec}s openAdm ${v.primary.openAdmissionSec}s closeAdm ${v.primary.closeAdmissionSec}s · check src ${v.check.source}`);
  }
}

// Every Window that started in the span: each Series' newest indices back to the span's start.
const wanted: { s: SeriesView; id: Hex }[] = [];
for (const s of series) {
  const back = BigInt(Math.ceil((minutes * 60) / s.cadenceSec) + 2);
  for (let k = 1n; k <= back && s.nextIndex - k >= 0n; k++) wanted.push({ s, id: marketIdOf(s.seriesId, s.nextIndex - k) as Hex });
}
const views = await fetchMarkets(client, venue, wanted.map((w) => w.id));
const byId = new Map<string, { s: SeriesView; m: MarketView }>();
wanted.forEach((w, i) => views[i] && byId.set(w.id.toLowerCase(), { s: w.s, m: views[i]! }));
const inSpan = (m: MarketView) => m.tradingStartSec >= nowSec - minutes * 60 && m.tradingStartSec <= nowSec - 30;

// Block time ≈ 0.6 s: read back far enough to cover the span (+5 min for a late print).
const from = head.number - BigInt(Math.ceil(((minutes + 5) * 60) / 0.55));
const blockTime = new Map<bigint, number>();
/** The public RPC refuses bursts ("too many connections from this IP"): wait and ask again. */
async function retry<T>(read: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await read();
    } catch (error) {
      if (i >= tries) throw error;
      await new Promise((r) => setTimeout(r, 1_000 * i));
    }
  }
}
const timeOf = async (log: { blockNumber: bigint | null }) => {
  const stamped = (log as { blockTimestamp?: bigint | Hex | null }).blockTimestamp;
  if (stamped != null) return Number(stamped);
  let at = blockTime.get(log.blockNumber!);
  if (at === undefined) blockTime.set(log.blockNumber!, (at = Number((await retry(() => client.public.getBlock({ blockNumber: log.blockNumber! }))).timestamp)));
  return at;
};
const openAt = new Map<string, number>();
const copied = new Map<string, boolean>();
const sides = new Map<string, { yes: number | null; no: number | null }>();
for (let a = from; a <= head.number; a += STEP) {
  const b = a + STEP - 1n > head.number ? head.number : a + STEP - 1n;
  const prints = await retry(() => client.public.getLogs({ address: venue.engine, event: PRINT, fromBlock: a, toBlock: b }));
  const executed = await retry(() => client.public.getLogs({ address: venue.engine, event: EXECUTED, fromBlock: a, toBlock: b }));
  for (const log of prints) {
    const id = String(log.args.marketId).toLowerCase();
    if (!byId.has(id) || Number(log.args.which) !== 0) continue;
    openAt.set(id, await timeOf(log));
    copied.set(id, Boolean(log.args.copied));
  }
  for (const log of executed) {
    const id = String(log.args.marketId).toLowerCase();
    if (!byId.has(id) || Number(log.args.orderType) !== ORDER_TYPE.postOnly) continue;
    const kind = Number(log.args.kind);
    const at = await timeOf(log);
    const s = sides.get(id) ?? { yes: null, no: null };
    if (kind === KIND.buyYes && s.yes === null) s.yes = at;
    if (kind === KIND.buyNo && s.no === null) s.no = at;
    sides.set(id, s);
  }
}

const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : null);
const groups = new Map<string, { print: number[]; book: number[]; copied: number; noBook: number }>();
const missing: string[] = [];
for (const [id, { s, m }] of byId) {
  if (!inSpan(m)) continue;
  const g = groups.get(key(s)) ?? { print: [], book: [], copied: 0, noBook: 0 };
  const p = openAt.get(id);
  if (p === undefined) missing.push(`${key(s)}#${m.index} start ${new Date(m.tradingStartSec * 1000).toISOString().slice(11, 19)} state ${m.state} void ${m.voidReason}`);
  else g.print.push(p - m.tradingStartSec);
  if (copied.get(id)) g.copied++;
  const sd = sides.get(id);
  // Both sides on the book: the later of the first bid and the first ask (a pre-open quote counts from the start).
  if (sd?.yes != null && sd.no != null) g.book.push(Math.max(sd.yes, sd.no, m.tradingStartSec) - m.tradingStartSec);
  else g.noBook++;
  groups.set(key(s), g);
}
console.log(`\nWindows started in the last ${minutes} min — seconds after the start (p50 / p90 / max):`);
console.log(`${"lane".padEnd(22)} ${"n".padStart(3)}  opening print            both sides quoted        no book`);
const fmt = (xs: number[]) => (xs.length ? `${pct(xs, 0.5)} / ${pct(xs, 0.9)} / ${Math.max(...xs)}`.padEnd(24) : "—".padEnd(24));
for (const [k, g] of [...groups].sort()) console.log(`${k.padEnd(22)} ${String(g.print.length).padStart(3)}  ${fmt(g.print)} ${fmt(g.book)} ${g.noBook}`);
console.log(`\nno opening print (started ≥ 30 s ago): ${missing.length}`);
for (const line of missing.slice(0, 60)) console.log(`  ${line}`);
