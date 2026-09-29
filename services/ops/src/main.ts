/** Ops entry: one process per network on Fly, every actor on `runActor`, one HTTP server (plan D-032, C.5). */
import { startHttp } from "./http/server";
import { readOpsEnv, runActor, heartbeats, errorText } from "./runtime";
import { chainHeadPass, CHAIN_HEAD_EVERY_MS } from "./actors/chain-head";

const env = readOpsEnv();
const log = (actor: string) => (why: string) => console.log(JSON.stringify({ t: new Date().toISOString(), actor, why }));

const registry: Record<string, () => void> = {
  "chain-head": () => runActor({ name: "chain-head", log: log("chain-head"), dryRun: env.dryRun, everyMs: CHAIN_HEAD_EVERY_MS, pass: chainHeadPass(env) }),
};

try {
  const wanted = env.actors.length ? env.actors : Object.keys(registry);
  for (const name of wanted) {
    const start = registry[name];
    if (!start) throw new Error(`unknown actor "${name}" (known: ${Object.keys(registry).join(", ")})`);
    start();
  }
  startHttp(env.httpPort);
  console.log(`[ops] network=${env.network} dryRun=${env.dryRun} actors=${wanted.join(",")}`);
} catch (error) {
  console.error(`[ops] start failed: ${errorText(error)}`);
  process.exit(78);
}

setInterval(() => {
  for (const beat of heartbeats()) {
    if (beat.passStartedMs !== null && Date.now() - beat.passStartedMs > env.stuckPassMs) {
      console.error(`[ops] ${beat.actor} pass stuck for ${Date.now() - beat.passStartedMs} ms; exiting`);
      process.exit(70);
    }
  }
}, 30_000).unref();
