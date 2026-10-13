// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/index.ts
/**
 * The seed maker (plan C.5.2 "seed-maker (Agari fair value + crypto σ)"): two-sided PostOnly quotes around a
 * spot-vs-open fair value on every trading Window, from the `seed-maker` key. Books have quotes; that is the job.
 * Regular Windows quote in session only; the 24/7 lanes (stock `<T>---24_7`, crypto) around the clock; the Gap against
 * the 24/7 feed over the weekend. A halted asset pulls. Our own quotes are budgeted per Window.
 * D-230: a pass plans every Window at once (its reads coalesce into a few multicalls) and sends the plans packed —
 * fresh books first — a few transactions a pass instead of one per Window, so a boundary's 38 new books fill within
 * seconds of their opening prints instead of minutes; and while a Window waits for its open, the pass comes back in 2 s.
 */
import { erc20Abi, encodeFunctionData, maxUint256, type Address } from "viem";
import { TEMPO } from "@cwf/clients";
import { chainNowSec, createOpsClient, fetchMarkets, listSeries, marketIdOf, sendOps, venueOf, type MarketView, type SeriesView } from "@cwf/markets/ops";
import { laneKey } from "@cwf/core";
import { errorText, runActor, roleKey, type VenueDeps } from "../../runtime";
import { chainRefused, packUnits, sendPacked, type PackSender, type PackUnit } from "../../runtime/pack";
import { createBasisTracker } from "./basis";
import { readSeedMakerEnv } from "./env";
import { laneQuote } from "./lanes";
import type { Placed } from "./quote";
import { planWindow, type Step, type WindowPlan, type WindowResult } from "./window";

const SERIES_LIST_MS = 5 * 60_000;
/** A requote is 2–4 calls (cancel, merge, the pair): four or five Windows a transaction, ≈ 3 M gas. */
const CALLS_PER_TX = 16;
/** While a trading Window waits for its opening print, the next pass comes this soon (the relay lands it in seconds). */
const OPEN_WAIT_PASS_MS = 2_000;

type Planned = { s: SeriesView; m: MarketView; label: string; plan: WindowPlan | null; error: unknown };
type Item = { w: Planned; step: Step };
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
  const basis = deps.display ? createBasisTracker(deps.display) : null;
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
    // The chain clock for the rest of the pass, read once: a pass of ~70 Windows runs for tens of seconds, and a
    // Window tended late must see the time it is tended at (its phase, its order's expiry), not the pass's start.
    const offsetMs = nowSec * 1000 - Date.now();
    const clockSec = () => Math.floor((Date.now() + offsetMs) / 1000);
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
    const trading = jobs.filter(({ m }) => m.tradingStartSec <= nowSec && nowSec < m.lockAtSec).length;
    let awaitingOpen = 0;
    // Every Window planned at once: the reads of a whole pass coalesce into a few multicalls.
    const planned: Planned[] = await Promise.all(jobs.map(async ({ s, m }) => {
      const label = `${laneKey(s.symbol!, s.lane!, s.cadenceSec)} #${m.index}`;
      const lane = laneQuote({ lane: s.lane!, symbol: s.symbol!, market: m, nowSec: clockSec(), status, spot: deps.spot, display: deps.display, basis, halts, env });
      if (lane.why.startsWith("waiting for the open") && m.tradingStartSec <= nowSec) awaitingOpen++;
      try {
        return { s, m, label, plan: await planWindow({ client, venue, env, dryRun, nowSec: clockSec(), clockSec, log: deps.log }, s, m, lane, placed.get(m.marketId) ?? null, label), error: null };
      } catch (error) {
        return { s, m, label, plan: null, error };
      }
    }));
    // Fresh books first (no pair resting), then requotes, shortest cadence first; then pulls and cancels.
    const rank = (w: Planned) => (w.plan && "steps" in w.plan && w.plan.fallback ? (placed.has(w.m.marketId) ? 1 : 0) : 2) * 1e7 + w.s.cadenceSec;
    const sending = planned.filter((w) => w.plan && "steps" in w.plan).sort((a, b) => rank(a) - rank(b));
    const results = new Map<Planned, WindowResult>();
    const landed = new Map<Planned, { n: number; hash: string }>();
    if (dryRun) {
      for (const w of sending) {
        const plan = w.plan as Extract<WindowPlan, { steps: Step[] }>;
        deps.log(`DRY ${plan.why} ${w.label}`);
        results.set(w, plan.done("dry"));
      }
    } else {
      const sender: PackSender<Item> = {
        send: async (items) => (await sendOps(client, items.map((i) => i.step.call), { nowSec: clockSec() })).hash,
        refused: chainRefused,
        landed: (i, hash, inTx) => {
          const was = landed.get(i.w);
          landed.set(i.w, { n: (was?.n ?? 0) + 1, hash });
          return `${i.w.label} ${i.step.what} ✓${inTx > 1 ? ` (${inTx} in tx)` : ""}`;
        },
        failed: (i, error) => ((i.w.error ??= error), `${i.w.label} ${i.step.what} failed: ${errorText(error).slice(0, 120)}`),
        skipped: (i, after) => `${i.w.label} ${i.step.what} waits for ${after.step.what}`,
        // One Window's steps refused on their own: one call at a time, against the book after the cancel.
        unitRefused: async (unit, error) => {
          const w = unit.items[0]!.w;
          const plan = w.plan as Extract<WindowPlan, { steps: Step[] }>;
          if (!plan.fallback) return [((w.error = error), `${w.label} refused: ${errorText(error).slice(0, 120)}`)];
          deps.log(`${w.label}: one-transaction requote refused (${errorText(error).slice(0, 80)}), one call at a time`);
          try {
            results.set(w, await plan.fallback());
          } catch (e) {
            w.error = e;
          }
          return [`${w.label} one call at a time`];
        },
      };
      const units: PackUnit<Item>[] = sending.map((w) => ({ items: (w.plan as Extract<WindowPlan, { steps: Step[] }>).steps.map((step) => ({ w, step })) }));
      await sendPacked(packUnits(units, CALLS_PER_TX), sender, 4);
      for (const w of sending) {
        const plan = w.plan as Extract<WindowPlan, { steps: Step[] }>;
        const got = landed.get(w);
        if (!results.has(w) && got && got.n === plan.steps.length) results.set(w, plan.done(got.hash));
      }
    }
    for (const w of planned) {
      const r = w.plan && "result" in w.plan ? w.plan.result : (results.get(w) ?? null);
      if (!r) {
        deps.log(`${w.label}: ${errorText(w.error ?? "not sent")}`);
        continue;
      }
      txCount += r.txs.length;
      if (r.txs.length) recent = [...r.txs.map((t) => `${w.label} ${t}`), ...recent].slice(0, 20);
      if (r.placed) placed.set(w.m.marketId, r.placed);
      else if (r.state !== "resting") placed.delete(w.m.marketId);
      if (r.state === "quoting" || r.state === "resting") {
        live.add(w.m.marketId);
        notes.push(`${w.label} ${r.note}`);
      }
    }
    for (const k of placed.keys()) if (!live.has(k)) placed.delete(k);
    return {
      // Honest counts: the Windows trading now, and those listed ahead of their start (quoted once they open).
      why: `${notes.length} of ${trading} trading Windows quoted · ${jobs.length - trading} listed ahead${awaitingOpen ? ` · ${awaitingOpen} awaiting their opening print` : ""} · session ${status?.state ?? "no calendar"} · ${txCount} txs${deps.spot ? "" : " · no spot feed"}${dryRun ? " · DRY RUN" : ""}${notes.length ? ` | ${notes.slice(0, 12).join("; ")}` : ""}`,
      detail: { quoting: notes.length, trading, listedAhead: jobs.length - trading, awaitingOpen, txs: txCount, recent },
      nextDelayMs: awaitingOpen ? OPEN_WAIT_PASS_MS : env.refreshMs,
    };
  };
  deps.log(`seed maker ${client.address ?? "(no key)"}: ${env.quoteLots} lots, ±${env.halfSpreadTicks} ticks, caps ${env.maxCashPerWindow}/${env.gapMaxCash}/${env.allDayMaxCash} base`);
  const actor = runActor({ name: "seed-maker", log: deps.log, dryRun, everyMs: env.refreshMs, pass });
  return { stop: () => (basis?.stop(), actor.stop()) };
}
