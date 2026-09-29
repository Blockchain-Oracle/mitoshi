/**
 * Ops entry (plan C.5, D-032, D-061): one process per network on Coolify, every actor on `runActor`, one HTTP server
 * on 8080. DRY_RUN stays on unless `DRY_RUN=0|false`; a missing role key forces that actor dry. A start failure exits
 * 78 so Coolify restarts the process; a stuck pass exits 70. Why-strings are redacted JSON lines.
 * Shape ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/main.ts (`boot`, `selectedActors`).
 */
import { createSql, runMigrations, type Sql } from "@cwf/db";
import { createSessionService } from "./calendar/session-service";
import { startHttp } from "./http/server";
import { sessionBody } from "./http/session";
import { createSpotFeed, SPOT_EVERY_MS, type SpotFeedHandle } from "./prices/spot";
import { loadRedstoneSources } from "./prices/redstone-gateway";
import { followTicks, wireTick } from "./prices/ticks";
import { createBus, createHaltBoard, createSessionEvents, errorText, heartbeats, readOpsEnv, redact, type VenueDeps } from "./runtime";
import { ACTORS, DEFAULT_ACTORS } from "./registry";

const EXIT_START_FAILED = 78;
const EXIT_STUCK = 70;

const env = readOpsEnv();
const line = (actor: string, why: string) => JSON.stringify({ t: new Date().toISOString(), actor, why: redact(why) });
const log = (actor: string) => (why: string) => console.log(line(actor, why));

function selected(): string[] {
  if (env.actors.length === 0) return [...DEFAULT_ACTORS];
  if (env.actors.includes("all")) return [...new Set([...Object.keys(ACTORS), ...env.actors.filter((a) => a !== "all")])];
  return env.actors;
}

async function boot(): Promise<void> {
  let sql: Sql | null = null;
  if (process.env.DATABASE_URL) {
    sql = createSql();
    const applied = await runMigrations(sql);
    log("ops")(`migrations: ${applied.length ? applied.join(", ") : "up to date"}`);
  }
  const wanted = selected();
  for (const name of wanted) if (!ACTORS[name]) throw new Error(`unknown actor "${name}" (known: ${Object.keys(ACTORS).join(", ")})`);
  const redstone = loadRedstoneSources();
  const bus = createBus();
  const halts = createHaltBoard();
  halts.subscribe((board) => bus.publish("halts", "halts", board));
  const events = createSessionEvents();
  const sessions = createSessionService({ sql, sources: redstone });
  void sessions.refresh().then(log("calendar"));
  const needsSpot = wanted.some((n) => ACTORS[n]!.spot);
  let spot: SpotFeedHandle | null = null;
  if (needsSpot) {
    spot = createSpotFeed({ sources: redstone, log: log("spot-feed"), everyMs: Number(process.env.SPOT_EVERY_MS) || SPOT_EVERY_MS });
    spot.start();
    followTicks(spot, bus, sql, log("spot-feed"));
  }
  // `OPS_DRY_ACTORS` keeps named actors dry while DRY_RUN=0 (the one-at-a-time roll-out out of dry run).
  const dryActors = new Set((process.env.OPS_DRY_ACTORS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const deps = (actor: string): VenueDeps => ({ env: { ...env, dryRun: env.dryRun || dryActors.has(actor) }, log: log(actor), sessions, spot, halts, events, bus, sql, redstone });
  for (const name of wanted) {
    try {
      await ACTORS[name]!.start(deps(name));
    } catch (error) {
      throw new Error(`${name}: ${errorText(error)}`);
    }
  }
  await startHttp({
    env, sql, spot, sessions, halts, events, bus, redstoneSigners: redstone.signers, log: log("http"),
    snapshot: async (topic) => {
      if (topic === "prices") return spot ? spot.symbols().flatMap((s) => (spot!.newest(s) ? [{ event: "price", data: wireTick(spot!.newest(s)!) }] : [])) : [];
      if (topic === "halts") return [{ event: "halts", data: halts.board() }];
      if (topic === "session") return [{ event: "session", data: sessionBody({ sessions, halts, events }) }];
      return [];
    },
  });
  setInterval(() => bus.publish("session", "session", sessionBody({ sessions, halts, events })), 60_000).unref();
  log("ops")(`network=${env.network} dryRun=${env.dryRun} actors=${wanted.join(",")}`);
}

try {
  await boot();
} catch (error) {
  console.error(line("ops", `start failed: ${errorText(error)} · exiting ${EXIT_START_FAILED} so Coolify restarts ops`));
  process.exit(EXIT_START_FAILED);
}

setInterval(() => {
  for (const beat of heartbeats()) {
    if (beat.passStartedMs !== null && Date.now() - beat.passStartedMs > env.stuckPassMs) {
      console.error(line("ops", `${beat.actor} pass stuck for ${Date.now() - beat.passStartedMs} ms; exiting ${EXIT_STUCK}`));
      process.exit(EXIT_STUCK);
    }
  }
}, 30_000).unref();
