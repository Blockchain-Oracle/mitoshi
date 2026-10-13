// Ported from Masayume 68f7a09:services/ops/src/actors/strategy-runner/index.ts — on `runActor`, the strategies and
// subscribers from the index (S9.4), each subscriber's grant and consent re-read on chain before anything is sent.
/**
 * strategy-runner (S9.5; L-55): the house runner — one key (`strategy-runner` role) trading each live subscriber's own
 * STRATEGY grant for every strategy that names it (or `STRATEGY_IDS`). Per strategy and cycle: the decision first (the
 * house model on the opening print vs the RedStone spot), then per subscriber the side their consent asks for (a fade
 * turns it around, A-1c), one IOC per Window through `placeFor`, sized inside the grant. Every cycle leaves a heartbeat
 * row in the runner's own words and, as data, what the pass did (`RunnerBeat`, which the app words). An agent strategy
 * is decided by its model read once per Window, reserved and recorded before anything is sent (`agent.ts`); a rule's
 * or a mirror's call is recorded once per Window too, and held to (`calls.ts`). Opt-in (`OPS_ACTORS`), dry by default
 * like every actor (D-218.6 / L-55); no key or no DATABASE_URL → report only. A mirror strategy copies one wallet's own
 * calls from the index (`mirror-scan.ts`).
 */
import type { Address, Hex } from "viem";
import { parseStrategyMetadata, type RunnerBeat, type RunnerIdle, type SkipKind, type SubscriptionMode } from "@cwf/core";
import { createPgStrategyAttempts, createPgStrategyStore } from "@cwf/db";
import { readIndexedStrategies, readSubscribers, readTraderCalls, type IndexedStrategy } from "@cwf/db/idx";
import { createOpsClient, listSeries, readBooks, readHoldings, readSubscriberStates, runnerVenueOf, tradingWindowsOf, type RunnerVenue } from "@cwf/markets/ops";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";
import { agentBootLine, createAgentState, scanAgent, warmAgentState } from "./agent";
import { settlementReader } from "./agent-record";
import { backfillCalls, holdRuleCalls, tallySkips } from "./calls";
import { scanOracleFollow, type Scan } from "./decide";
import { scanMirror } from "./mirror-scan";
import { executeCalls, executeForSubscriber, recoverAttempts } from "./execute";

const DEFAULT_INTERVAL_MS = 30_000;
const SPOT_MAX_AGE_SEC = 30;

export function readRunnerIds(env: NodeJS.ProcessEnv = process.env): bigint[] {
  return (env.STRATEGY_IDS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map((s) => BigInt(s));
}

export function startStrategyRunner(deps: Pick<VenueDeps, "env" | "log" | "sql" | "spot" | "bus">): { stop: () => void } {
  const key = roleKey("strategy-runner", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key });
  const rv: RunnerVenue | null = runnerVenueOf(client.chainId);
  const dryRun = deps.env.dryRun || !key;
  const everyMs = Number(process.env.RUNNER_INTERVAL_MS) >= 5_000 ? Number(process.env.RUNNER_INTERVAL_MS) : DEFAULT_INTERVAL_MS;
  const only = readRunnerIds();
  const store = deps.sql ? createPgStrategyStore(deps.sql) : null;
  const attempts = deps.sql ? createPgStrategyAttempts(deps.sql) : null;
  const runner = (client.address ?? "0x0000000000000000000000000000000000000000") as Address;
  if (!key) deps.log("STRATEGY_RUNNER_PRIVATE_KEY / strategy-runner.json missing: scanning and reporting only");
  const agent = createAgentState(deps.sql);
  deps.log(agentBootLine(agent));
  let warmed = false;
  let anySeries: Hex[] | null = null;
  const counts: { filled: number; skipped: Partial<Record<SkipKind, number>> } = { filled: 0, skipped: {} };

  const heartbeat = async (strategyId: bigint, why: string, state: RunnerBeat, scan: Pick<Scan, "scanned" | "closestBps"> = { scanned: 0, closestBps: null }) => {
    await store?.recordHeartbeat({ runner, strategyId: strategyId.toString(), intervalMs: everyMs, why, scanned: scan.scanned, closestBps: scan.closestBps, dryRun, state }).catch((e: unknown) => deps.log(`heartbeat not stored: ${errorText(e)}`));
    return `#${strategyId}: ${why}`;
  };
  const idle = (strategyId: bigint, why: string, kind: RunnerIdle, copiers = 0) => heartbeat(strategyId, why, { kind: "idle", idle: kind, copiers });

  /** A strategy scoped to a series trades that series; "any" scans every crypto 5-minute series. */
  const seriesOf = async (s: IndexedStrategy): Promise<Hex[]> => {
    if (s.series) return [s.series as Hex];
    anySeries ??= (await listSeries(client, rv!)).filter((x) => x.lane === "crypto24" && x.cadenceSec === 300).map((x) => x.seriesId);
    return anySeries;
  };

  const runOne = async (s: IndexedStrategy, nowMs: number): Promise<string> => {
    const id = BigInt(s.strategyId);
    if (!s.active) return idle(id, "closed to new copiers by its creator; idle", "closed");
    const meta = s.metadata ? parseStrategyMetadata(s.metadata) : null;
    if (!meta) return idle(id, "metadata carries no readable spec; idle", "unreadable");
    const subs = (await readSubscribers(deps.sql!, rv!.registry, s.strategyId)).map((x) => ({ owner: x.subscriber as Address, grantId: BigInt(x.grantId), mode: x.mode as SubscriptionMode }));
    if (subs.length === 0) return idle(id, "published; waiting for a live subscriber", "no-copier");
    const states = (await readSubscriberStates(client, rv!, id, subs)).filter((x) => x.live && x.grant);
    if (states.length === 0) return idle(id, `${subs.length} subscriber${subs.length === 1 ? "" : "s"}, none with a live grant`, "no-live-budget");
    const spec = meta.spec;
    const nowSec = Math.floor(nowMs / 1000);
    const windows = await tradingWindowsOf(client, rv!, await seriesOf(s), nowSec);
    const spotLatest = (symbol: string) => deps.spot?.latest(symbol as never, SPOT_MAX_AGE_SEC) ?? null;
    const scan =
      spec.preset === "mirror"
        ? scanMirror(windows, spec, await readTraderCalls(deps.sql!, { address: spec.trader, sinceSec: nowSec - spec.withinSec, markets: windows.map((w) => w.marketId) }), nowMs)
        : spec.preset === "agent"
        ? await scanAgent({
            books: (ids) => readBooks(client, rv!, ids), settlementOf: settlementReader(client, rv!), store: store!, runner, dryRun, agent, log: deps.log,
            spot: { latest: spotLatest, at: (sym, sec, win) => deps.spot?.at(sym as never, sec, win) ?? null },
          }, s, spec, windows, nowMs)
        : scanOracleFollow(windows, spec, spotLatest);
    if (scan.idle) return idle(id, scan.why, scan.idle, states.length);
    const candidates = spec.preset === "agent" ? scan.candidates : await holdRuleCalls({ store: store!, strategy: s, spec, scan, runner, nowMs, dryRun });
    const beat = (filled: number, skipped: SkipKind[]): RunnerBeat => ({ kind: "scan", copiers: states.length, windows: scan.scanned, closestBps: scan.closestBps, calls: candidates.length, filled, skipped: tallySkips(skipped) });
    if (candidates.length === 0) return heartbeat(id, `${scan.why}; ${states.length} live subscriber${states.length === 1 ? "" : "s"}`, beat(0, []), scan);
    const markets = candidates.map((c) => c.window.marketId);
    const [books, held] = await Promise.all([readBooks(client, rv!, markets), readHoldings(client, rv!, states.flatMap((st) => markets.map((m) => ({ owner: st.owner, marketId: m }))))]);
    const run = await executeCalls({
      strategyId: s.strategyId, candidates, subs: states, dryRun, store: store!,
      execute: (sub, { window, decision }) => executeForSubscriber({
        client, rv: rv!, attempts: attempts!, strategyId: id, sub, window, decision, book: books.get(window.marketId.toLowerCase()) ?? null,
        held: held.get(`${sub.owner.toLowerCase()}:${window.marketId.toLowerCase()}`) ?? { up: 0n, down: 0n }, nowSec, nowMs, dryRun,
      }),
      onFilled: (sub, { window }, r) => {
        counts.filled += 1;
        deps.bus.publish(`user:${sub.owner.toLowerCase()}`, "strategy-fill", { strategyId: s.strategyId, marketId: window.marketId, side: r.side, mode: sub.mode, txHash: r.txHash });
      },
    });
    if (run.unknown !== null) return heartbeat(id, `confirmation unknown: ${run.unknown}; holding new entries`, { kind: "idle", idle: "unconfirmed", copiers: states.length }, scan);
    for (const [k, n] of Object.entries(tallySkips(run.skips)) as [SkipKind, number][]) counts.skipped[k] = (counts.skipped[k] ?? 0) + n;
    return heartbeat(id, `${scan.why}; ${run.filled} filled${run.notes.length ? ` — ${run.notes.slice(0, 4).join("; ")}` : ""}${dryRun ? " (dry run)" : ""}`, beat(run.filled, run.skips), scan);
  };

  const pass = async () => {
    if (!rv) return { why: "StrategyRegistry is not deployed on this network; idle" };
    if (!deps.sql || !store || !attempts) return { why: "no DATABASE_URL: the runner's attempt and fill stores are unavailable; holding" };
    const all = await readIndexedStrategies(deps.sql, { registry: rv.registry });
    const mine = all.filter((s) => (only.length ? only.includes(BigInt(s.strategyId)) : s.runner === runner.toLowerCase()));
    if (!warmed) {
      // A read interrupted by a restart holds its Window; the hour's reads still count against the budget.
      await store.interruptDecisions(runner, Date.now());
      await warmAgentState(agent, store, Date.now());
      // A rule's calls before they were recorded come back from its fills, once.
      const recovered = dryRun ? 0 : await backfillCalls(store, mine, runner);
      if (recovered > 0) deps.log(`recorded ${recovered} earlier rule call(s) from their fills`);
      warmed = true;
    }
    const open = dryRun ? 0 : await recoverAttempts(client, rv, attempts, runner, deps.log);
    if (open > 0) return { why: `${open} attempt(s) with unknown confirmation; holding every new entry until each is settled from its receipt`, detail: { runner, counts } };
    if (mine.length === 0) return { why: `no strategy names ${runner}${only.length ? ` among ${only.join(", ")}` : ""}; idle`, detail: { runner, counts } };
    const lines: string[] = [];
    for (const s of mine) {
      try {
        lines.push(await runOne(s, Date.now()));
      } catch (error) {
        lines.push(await idle(BigInt(s.strategyId), `holding: ${errorText(error).slice(0, 160)}`, "error"));
      }
    }
    return { why: `${lines.join(" | ")}${dryRun ? " · DRY RUN" : ""}`, detail: { runner, strategies: mine.map((s) => s.strategyId), counts } };
  };

  deps.log(`strategy-runner ${runner} every ${everyMs / 1000} s${only.length ? ` on ${only.join(", ")}` : " on every strategy naming it"}`);
  return runActor({ name: "strategy-runner", log: deps.log, dryRun, everyMs, pass, critical: false });
}
