// Ported from Masayume 68f7a09:services/ops/src/actors/strategy-runner/index.ts — on `runActor`, the strategies and
// subscribers from the index (S9.4), each subscriber's grant and consent re-read on chain before anything is sent.
/**
 * strategy-runner (S9.5; L-55): the house runner — one key (`strategy-runner` role) trading each live subscriber's own
 * STRATEGY grant for every strategy that names it (or `STRATEGY_IDS`). Per strategy and cycle: the decision first (the
 * house model on the opening print vs the RedStone spot), then per subscriber the side their consent asks for (a fade
 * turns it around, A-1c), one IOC per Window through `placeFor`, sized inside the grant. Every cycle leaves a heartbeat
 * row in the runner's own words. Opt-in (`OPS_ACTORS`), dry by default like every actor (D-218.6 / L-55); no key or no
 * DATABASE_URL → report only. Agent and mirror strategies are read by their own scanners (S9.5b, S9.6).
 */
import type { Address, Hex } from "viem";
import { parseStrategyMetadata, type SubscriptionMode } from "@cwf/core";
import { createPgStrategyAttempts, createPgStrategyStore } from "@cwf/db";
import { readIndexedStrategies, readSubscribers, type IndexedStrategy } from "@cwf/db/idx";
import { createOpsClient, listSeries, readBooks, readHoldings, readSubscriberStates, runnerVenueOf, tradingWindowsOf, type RunnerVenue } from "@cwf/markets/ops";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";
import { scanOracleFollow, type Scan } from "./decide";
import { executeForSubscriber, recoverAttempts } from "./execute";

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
  let anySeries: Hex[] | null = null;
  let counts = { filled: 0, skipped: 0 };

  const heartbeat = async (strategyId: bigint, why: string, scan: Pick<Scan, "scanned" | "closestBps"> = { scanned: 0, closestBps: null }) => {
    await store?.recordHeartbeat({ runner, strategyId: strategyId.toString(), intervalMs: everyMs, why, scanned: scan.scanned, closestBps: scan.closestBps, dryRun }).catch((e: unknown) => deps.log(`heartbeat not stored: ${errorText(e)}`));
    return `#${strategyId}: ${why}`;
  };

  /** A strategy scoped to a series trades that series; "any" scans every crypto 5-minute series. */
  const seriesOf = async (s: IndexedStrategy): Promise<Hex[]> => {
    if (s.series) return [s.series as Hex];
    anySeries ??= (await listSeries(client, rv!)).filter((x) => x.lane === "crypto24" && x.cadenceSec === 300).map((x) => x.seriesId);
    return anySeries;
  };

  const runOne = async (s: IndexedStrategy, nowMs: number): Promise<string> => {
    const id = BigInt(s.strategyId);
    if (!s.active) return heartbeat(id, "closed to new copiers by its creator; idle");
    const meta = s.metadata ? parseStrategyMetadata(s.metadata) : null;
    if (!meta) return heartbeat(id, "metadata carries no readable spec; idle");
    const subs = (await readSubscribers(deps.sql!, rv!.registry, s.strategyId)).map((x) => ({ owner: x.subscriber as Address, grantId: BigInt(x.grantId), mode: x.mode as SubscriptionMode }));
    if (subs.length === 0) return heartbeat(id, "published; waiting for a live subscriber");
    const states = (await readSubscriberStates(client, rv!, id, subs)).filter((x) => x.live && x.grant);
    if (states.length === 0) return heartbeat(id, `${subs.length} subscriber${subs.length === 1 ? "" : "s"}, none with a live grant`);
    const spec = meta.spec;
    if (spec.preset !== "momentum" && spec.preset !== "reversion") return heartbeat(id, `${spec.preset} strategies are read by their own scanner; ${states.length} live subscriber${states.length === 1 ? "" : "s"} waiting`);
    const nowSec = Math.floor(nowMs / 1000);
    const windows = await tradingWindowsOf(client, rv!, await seriesOf(s), nowSec);
    const scan = scanOracleFollow(windows, spec, (symbol) => deps.spot?.latest(symbol as never, SPOT_MAX_AGE_SEC) ?? null);
    if (scan.candidates.length === 0) return heartbeat(id, `${scan.why}; ${states.length} live subscriber${states.length === 1 ? "" : "s"}`, scan);
    const markets = scan.candidates.map((c) => c.window.marketId);
    const [books, held] = await Promise.all([readBooks(client, rv!, markets), readHoldings(client, rv!, states.flatMap((st) => markets.map((m) => ({ owner: st.owner, marketId: m }))))]);
    let filled = 0;
    const notes: string[] = [];
    for (const { window, decision } of scan.candidates) {
      for (const sub of states) {
        const r = await executeForSubscriber({
          client, rv: rv!, attempts: attempts!, strategyId: id, sub, window, decision, book: books.get(window.marketId.toLowerCase()) ?? null,
          held: held.get(`${sub.owner.toLowerCase()}:${window.marketId.toLowerCase()}`) ?? { up: 0n, down: 0n }, nowSec, nowMs, dryRun,
        });
        if (r.status === "filled") {
          filled += 1;
          counts.filled += 1;
          deps.bus.publish(`user:${sub.owner.toLowerCase()}`, "strategy-fill", { strategyId: s.strategyId, marketId: window.marketId, side: r.side, mode: sub.mode, txHash: r.txHash });
          notes.push(`filled ${r.side.toUpperCase()} for ${sub.owner.slice(0, 8)} ${r.txHash.slice(0, 10)}`);
        } else {
          counts.skipped += 1;
          notes.push(`${sub.owner.slice(0, 8)} ${r.status}: ${r.reason}`);
          if (r.status === "unknown") return heartbeat(id, `confirmation unknown: ${r.reason}; holding new entries`, scan);
        }
      }
    }
    return heartbeat(id, `${scan.why}; ${filled} filled${notes.length ? ` — ${notes.slice(0, 4).join("; ")}` : ""}${dryRun ? " (dry run)" : ""}`, scan);
  };

  const pass = async () => {
    if (!rv) return { why: "StrategyRegistry is not deployed on this network; idle" };
    if (!deps.sql || !store || !attempts) return { why: "no DATABASE_URL: the runner's attempt and fill stores are unavailable; holding" };
    const open = dryRun ? 0 : await recoverAttempts(client, rv, attempts, runner, deps.log);
    if (open > 0) return { why: `${open} attempt(s) with unknown confirmation; holding every new entry until each is settled from its receipt`, detail: { runner, counts } };
    const all = await readIndexedStrategies(deps.sql, { registry: rv.registry });
    const mine = all.filter((s) => (only.length ? only.includes(BigInt(s.strategyId)) : s.runner === runner.toLowerCase()));
    if (mine.length === 0) return { why: `no strategy names ${runner}${only.length ? ` among ${only.join(", ")}` : ""}; idle`, detail: { runner, counts } };
    const lines: string[] = [];
    for (const s of mine) {
      try {
        lines.push(await runOne(s, Date.now()));
      } catch (error) {
        lines.push(await heartbeat(BigInt(s.strategyId), `holding: ${errorText(error).slice(0, 160)}`));
      }
    }
    return { why: `${lines.join(" | ")}${dryRun ? " · DRY RUN" : ""}`, detail: { runner, strategies: mine.map((s) => s.strategyId), counts } };
  };

  deps.log(`strategy-runner ${runner} every ${everyMs / 1000} s${only.length ? ` on ${only.join(", ")}` : " on every strategy naming it"}`);
  return runActor({ name: "strategy-runner", log: deps.log, dryRun, everyMs, pass, critical: false });
}
