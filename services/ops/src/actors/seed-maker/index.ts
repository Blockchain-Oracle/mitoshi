// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/index.ts
/**
 * The seed maker (plan C.5.2 "seed-maker (Agari fair value + crypto σ)"): two-sided PostOnly quotes around a
 * spot-vs-open fair value on every trading Window, from the `seed-maker` key. Books have quotes; that is the job.
 * Regular Windows quote in session only; the 24/7 lanes (stock `<T>---24_7`, crypto) around the clock; the Gap against
 * the 24/7 feed over the weekend. A halted asset pulls. Our own quotes are budgeted per Window.
 */
import { erc20Abi, encodeFunctionData, maxUint256, type Address } from "viem";
import { TEMPO } from "@cwf/clients";
import { chainNowSec, createOpsClient, fetchMarkets, listSeries, marketIdOf, sendOps, venueOf, type SeriesView } from "@cwf/markets/ops";
import { laneKey } from "@cwf/core";
import { errorText, runActor, roleKey, type VenueDeps } from "../../runtime";
import { readSeedMakerEnv } from "./env";
import { laneQuote } from "./lanes";
import type { Placed } from "./quote";
import { tendWindow } from "./window";

const SERIES_LIST_MS = 5 * 60_000;
const CONCURRENCY = 6;
/** Keep at least this much pathUSD allowance for the engine; top up to the full balance's order of magnitude. */
const ALLOWANCE_FLOOR = 100_000n * 1_000_000n;

export function startSeedMaker(deps: VenueDeps): { stop: () => void } {
  const env = readSeedMakerEnv();
  const key = roleKey("seed-maker", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key });
  const venue = venueOf(client.chainId);
  if (!venue) throw new Error(`no engine fragment for chain ${client.chainId}`);
  const dryRun = deps.env.dryRun || !key;
  if (!key) deps.log("SEED_MAKER_PRIVATE_KEY / seed-maker.json missing: scanning and reporting only");
  let series: SeriesView[] = [];
  let listedMs = 0;
  const placed = new Map<string, Placed>();
  let txCount = 0;
  let recent: string[] = [];

  const ensureAllowance = async () => {
    if (dryRun || !client.address) return;
    const have = (await client.public.readContract({ address: TEMPO.pathUSD as Address, abi: erc20Abi, functionName: "allowance", args: [client.address, venue.engine] })) as bigint;
    if (have >= ALLOWANCE_FLOOR) return;
    const sent = await sendOps(client, [{ to: TEMPO.pathUSD as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [venue.engine, maxUint256 / 2n] }) }]);
    deps.log(`approved the engine for pathUSD · ${sent.hash}`);
  };

  const pass = async () => {
    await ensureAllowance();
    await deps.sessions.refresh();
    if (Date.now() - listedMs > SERIES_LIST_MS || series.length === 0) {
      series = (await listSeries(client, venue)).filter((s) => s.symbol && s.lane && env.cadencesSec.includes(s.cadenceSec) && (!env.symbols || env.symbols.includes(s.symbol)));
      listedMs = Date.now();
    }
    const nowSec = await chainNowSec(client);
    const status = deps.sessions.status(nowSec);
    const halts = deps.halts.board();
    // Re-read each Series' newest two indices: the trading Window and, near a boundary, the one listed after it.
    const fresh = await listSeries(client, venue).then((all) => new Map(all.map((s) => [s.seriesId, s])));
    const refs = series.flatMap((s0) => {
      const s = fresh.get(s0.seriesId) ?? s0;
      return [1n, 2n].filter((k) => s.nextIndex >= k).map((k) => ({ s, id: marketIdOf(s.seriesId, s.nextIndex - k) }));
    });
    const views = await fetchMarkets(client, venue, refs.map((r) => r.id));
    const notes: string[] = [];
    const live = new Set<string>();
    const jobs = refs.flatMap((r, i) => (views[i] && views[i]!.state === 0 ? [{ ...r, m: views[i]! }] : []));
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      await Promise.all(jobs.slice(i, i + CONCURRENCY).map(async ({ s, m }) => {
        const label = `${laneKey(s.symbol!, s.lane!, s.cadenceSec)} #${m.index}`;
        const lane = laneQuote({ lane: s.lane!, symbol: s.symbol!, market: m, nowSec, status, spot: deps.spot, halts, env });
        try {
          const r = await tendWindow({ client, venue, env, dryRun, nowSec, log: deps.log }, s, m, lane, placed.get(m.marketId) ?? null, label);
          txCount += r.txs.length;
          if (r.txs.length) recent = [...r.txs.map((t) => `${label} ${t}`), ...recent].slice(0, 20);
          if (r.placed) placed.set(m.marketId, r.placed);
          else if (r.state !== "resting") placed.delete(m.marketId);
          if (r.state === "quoting" || r.state === "resting") {
            live.add(m.marketId);
            notes.push(`${label} ${r.note}`);
          }
        } catch (error) {
          deps.log(`${label}: ${errorText(error)}`);
        }
      }));
    }
    for (const k of placed.keys()) if (!live.has(k)) placed.delete(k);
    return {
      why: `${notes.length} Windows quoted of ${jobs.length} open · session ${status?.state ?? "no calendar"} · ${txCount} txs${deps.spot ? "" : " · no spot feed"}${dryRun ? " · DRY RUN" : ""}${notes.length ? ` | ${notes.slice(0, 12).join("; ")}` : ""}`,
      detail: { quoting: notes.length, open: jobs.length, txs: txCount, recent },
    };
  };
  deps.log(`seed maker ${client.address ?? "(no key)"}: ${env.quoteLots} lots, ±${env.halfSpreadTicks} ticks, caps ${env.maxCashPerWindow}/${env.gapMaxCash}/${env.allDayMaxCash} base`);
  return runActor({ name: "seed-maker", log: deps.log, dryRun, everyMs: env.refreshMs, pass });
}
