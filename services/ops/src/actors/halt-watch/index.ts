// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/halt-watch/{index,signals,fixture}.ts
/**
 * halt-watch (plan C.5.2): RedStone staleness and signer counts per feed (from the spot feed), Data Streams freshness and
 * `marketStatus` (mainnet), Alpaca's tradable flag → the process's halt board. The board's only writer; it never
 * signs. The roller lists nothing for a halted asset, the maker pulls, and an open Window voids by itself if its print
 * can't be recorded. Every pass that observes a reason or changes the board is logged to `halt_log` for replay.
 * `HALT_WATCH_FIXTURE=<json>` injects observations for a proof run and says FIXTURE in every why-string.
 */
import { readFileSync } from "node:fs";
import { HALT_ASSETS, haltAssetOf, haltLabel, STOCK_SYMBOLS, TICKERS, type HaltAsset, type PrintSource } from "@cwf/core";
import { createOpsClient, listSeries, venueOf } from "@cwf/markets/ops";
import { fetchAlpacaTradable } from "../../calendar/alpaca";
import { runActor, type PassResult, type VenueDeps } from "../../runtime";
import { emptyHaltState, nonNull, observeHalts, redstoneUnreadable, stepHalts, type Observations } from "./decide";

const PASS_MS = 5_000;
const BOOT_GRACE_SEC = 20;
const EXCHANGE_READ_MS = 60_000;
const SOURCES_READ_MS = 5 * 60_000;
const IN_HOURS = new Set(["regular", "early-close", "halted"]);
const SOURCE_NAME: Record<number, PrintSource> = { 2: "redstone", 5: "datastreams", 4: "attested" };

export interface HaltFixture {
  name: string;
  session: "regular" | null;
  /** Ages (s) of the newest RedStone package per asset, and optional signer counts. */
  redstone: Record<string, { ageSec: number; signers?: number }>;
  exchange: Record<string, boolean>;
}

export function loadHaltFixture(path: string | undefined): HaltFixture | null {
  if (!path) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<HaltFixture>;
  return { name: path.split("/").at(-1) ?? path, session: raw.session === "regular" ? "regular" : null, redstone: raw.redstone ?? {}, exchange: raw.exchange ?? {} };
}

export function applyFixture(o: Observations, f: HaltFixture): void {
  for (const [asset, r] of Object.entries(f.redstone)) o.redstone[asset as HaltAsset] = { packageSec: o.nowSec - r.ageSec, signers: r.signers ?? 5 };
  for (const [asset, t] of Object.entries(f.exchange)) o.exchange[asset as HaltAsset] = t;
}

export function startHaltWatch(deps: VenueDeps): { stop: () => void } {
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, tier: 2 });
  const venue = venueOf(client.chainId);
  if (!venue) throw new Error(`no engine fragment for chain ${client.chainId}`);
  const fixture = loadHaltFixture(process.env.HALT_WATCH_FIXTURE);
  const startedSec = Math.floor(Date.now() / 1000);
  const state = emptyHaltState();
  let primary: Observations["primary"] = {};
  let primaryReadMs = 0;
  const exchange: Observations["exchange"] = {};
  let exchangeReadMs = 0;
  let last = "";
  let lastObserved = false;
  /** Passes in a row that could not read RedStone, and since when (a fetch failure: health, never a halt; D-186). */
  const unread = { passes: 0, sinceSec: null as number | null, total: 0 };
  if (fixture) deps.log(`FIXTURE ${fixture.name}: injected observations replace live ones for the assets it names`);

  /** Each asset's primary source now, from the Series' policy versions on chain (one per asset: the widest lane's). */
  const readPrimary = async (nowSec: number) => {
    const out: Observations["primary"] = {};
    for (const s of await listSeries(client, venue)) {
      if (!s.symbol || !s.lane) continue;
      const v = [...s.versions].reverse().find((x) => x.validFromSec <= nowSec && (x.validUntilSec === null || nowSec <= x.validUntilSec));
      const feedless = s.lane === "stock24" && TICKERS[s.symbol].redstone24x7FeedId === null;
      out[haltAssetOf(s.symbol, s.lane)] = v && !feedless ? (SOURCE_NAME[v.primary.source] ?? null) : null;
    }
    primary = out;
  };

  const pass = async (): Promise<PassResult> => {
    const calendarNote = await deps.sessions.refresh();
    const nowSec = Math.floor(Date.now() / 1000);
    if (Date.now() - primaryReadMs > SOURCES_READ_MS) {
      await readPrimary(nowSec);
      primaryReadMs = Date.now();
    }
    const status = deps.sessions.status(nowSec);
    const inHours = fixture?.session === "regular" || (status !== null && IN_HOURS.has(status.state));
    const problems: string[] = [];
    if (inHours && Date.now() - exchangeReadMs > EXCHANGE_READ_MS) {
      exchangeReadMs = Date.now();
      await Promise.all(STOCK_SYMBOLS.map(async (s) => {
        try {
          const t = await fetchAlpacaTradable(s);
          if (t !== null) exchange[s] = t;
        } catch (error) {
          problems.push(`alpaca ${s}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }));
    }
    const redstone: Observations["redstone"] = {};
    for (const asset of HALT_ASSETS) {
      const q = deps.spot?.newest(asset);
      if (q) redstone[asset] = { packageSec: q.publishTimeSec, signers: q.signers };
    }
    const observations: Observations = { nowSec, inRegularHours: inHours && nowSec - startedSec >= BOOT_GRACE_SEC, primary, redstone, datastreams: {}, exchange: { ...exchange }, redstoneReadSec: deps.spot?.lastReadSec() ?? null };
    if (fixture) applyFixture(observations, fixture);
    const unreadable = redstoneUnreadable(observations);
    if (unreadable) {
      unread.passes++;
      unread.total++;
      unread.sinceSec ??= nowSec;
    } else Object.assign(unread, { passes: 0, sinceSec: null });
    // Until the spot feed's first reads land every source would look stale: observe nothing during the boot grace.
    const booting = nowSec - startedSec < BOOT_GRACE_SEC && !fixture;
    const observed = booting ? observeHalts({ ...observations, primary: {} }) : observeHalts(observations);
    const confirmed = stepHalts(state, observed, observations.inRegularHours);
    for (const [asset, reason] of confirmed) {
      if (reason) deps.halts.set(asset, reason, nowSec);
      else deps.halts.clear(asset);
    }
    const obs = nonNull(observed);
    const conf = nonNull(confirmed);
    const snapshot = JSON.stringify(conf);
    // Logged whenever anything was observed, the board changed, or the previous pass observed something: an omitted pass
    // is then always all-clear on an all-clear board, so a replay of the log reproduces every transition exactly.
    const observedAny = Object.keys(obs).length > 0;
    if (deps.sql && (observedAny || lastObserved || snapshot !== last)) {
      await deps.sql`insert into halt_log (pass_sec, in_hours, observed, confirmed, fixture) values (${nowSec}, ${observations.inRegularHours}, ${deps.sql.json(obs)}, ${deps.sql.json(conf)}, ${fixture?.name ?? null})`;
      await deps.sql`delete from halt_log where pass_sec < ${nowSec - 30 * 86_400}`;
    }
    last = snapshot;
    lastObserved = observedAny;
    const board = deps.halts.board();
    const halted = Object.entries(board).map(([a, e]) => `${a} ${e!.reason}`);
    const readAge = observations.redstoneReadSec == null ? null : nowSec - observations.redstoneReadSec;
    const unreadNote = unreadable ? [`RedStone unreadable (${unreadable === "fetch-failed" ? `our fetch failing, last read ${readAge ?? "never"} s ago` : "every feed stale at once"}) for ${nowSec - unread.sinceSec!} s: halts held`] : [];
    return {
      why: [halted.length ? `halted: ${halted.join(", ")}` : "no halts", ...unreadNote, observations.inRegularHours ? "session assets watched" : `session assets idle (${status?.state ?? "no calendar"})`, ...(fixture ? [`FIXTURE ${fixture.name}`] : []), ...(calendarNote === "calendar fresh" ? [] : [calendarNote]), ...problems].join(" · "),
      detail: {
        halts: board, labels: Object.fromEntries(Object.entries(board).map(([a, e]) => [a, haltLabel(e!.reason)])), observed: obs,
        redstone: { readable: unreadable === null, unreadable, lastReadAgeSec: readAge, unreadSinceSec: unread.sinceSec, unreadPasses: unread.passes, unreadPassesTotal: unread.total },
        redstoneAgeSec: Object.fromEntries(Object.entries(redstone).map(([a, r]) => [a, nowSec - r!.packageSec])), exchange, fixture: fixture?.name ?? null,
      },
    };
  };
  return runActor({ name: "halt-watch", log: deps.log, dryRun: false, everyMs: PASS_MS, pass });
}
