// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/window-roller/index.ts
/**
 * window-roller (plan C.5.2): lists Regular Windows back to back on the agreed session calendar, the weekend Gap, and
 * the 24/7 stock and crypto lanes, each on the highest covering policy version. One writer: the `roller` key (the
 * engine's ROLLER role). Dry-run by default; a missing key or a key without the role scans and reports only.
 */
import { chainNowSec, createOpsClient, isRoller, venueOf } from "@cwf/markets/ops";
import { runActor, roleKey, type VenueDeps } from "../../runtime";
import { rollerPass, type RollerSettings, type RollerState } from "./execute";
import { DEFAULT_GAP_LEAD_SEC, DEFAULT_LEAD_SEC, DEFAULT_MIN_TRADABLE_SEC, DEFAULT_PRELIST, DEFAULT_PRELIST_CADENCES_SEC } from "./plan";

const intEnv = (raw: string | undefined, fallback: number) => (raw && Number.isInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : fallback);
const boolEnv = (raw: string | undefined, fallback: boolean) => (raw === undefined || raw === "" ? fallback : !["0", "false", "off", "no"].includes(raw.toLowerCase()));

export function readRollerSettings(env: NodeJS.ProcessEnv = process.env): RollerSettings {
  const cadences = (env.ROLLER_PRELIST_CADENCES ?? "").split(",").map(Number).filter((n) => DEFAULT_PRELIST_CADENCES_SEC.includes(n));
  return {
    leadSec: intEnv(env.ROLLER_LEAD_SEC, DEFAULT_LEAD_SEC),
    gapLeadSec: intEnv(env.ROLLER_GAP_LEAD_SEC, DEFAULT_GAP_LEAD_SEC),
    minTradableSec: intEnv(env.ROLLER_MIN_TRADABLE_SEC, DEFAULT_MIN_TRADABLE_SEC),
    prelist: boolEnv(env.ROLLER_PRELIST, DEFAULT_PRELIST),
    prelistCadencesSec: cadences.length ? cadences : DEFAULT_PRELIST_CADENCES_SEC,
    only: (env.ROLLER_SERIES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    concurrency: intEnv(env.ROLLER_CONCURRENCY, 4),
  };
}

export async function startWindowRoller(deps: VenueDeps): Promise<{ stop: () => void }> {
  const key = roleKey("roller", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key });
  const venue = venueOf(client.chainId);
  if (!venue) throw new Error(`no engine fragment for chain ${client.chainId}`);
  let dryRun = deps.env.dryRun;
  if (!client.address) {
    deps.log("ROLLER_PRIVATE_KEY / roller.json missing: scanning and reporting only");
    dryRun = true;
  } else if (!(await isRoller(client, venue, client.address))) {
    deps.log(`roller key ${client.address} lacks the engine's ROLLER role: scanning and reporting only`);
    dryRun = true;
  }
  const settings = readRollerSettings();
  const state: RollerState = { client, venue, settings, dryRun, series: [], seriesListedMs: 0, lanes: {}, counters: { opened: 0, failed: 0 }, recent: [] };
  deps.log(`roller ${client.address ?? "(no key)"}, lead ${settings.leadSec} s, gap lead ${settings.gapLeadSec} s, prelist ${settings.prelist ? settings.prelistCadencesSec.join("/") : "off"}${settings.only.length ? `, only ${settings.only.join(",")}` : ""}`);
  const clockOf = async () => {
    await deps.sessions.refresh();
    return {
      calendar: deps.sessions.calendar(), nowSec: await chainNowSec(client), leadSec: settings.leadSec, gapLeadSec: settings.gapLeadSec, minTradableSec: settings.minTradableSec,
      prelist: settings.prelist, prelistCadencesSec: settings.prelistCadencesSec, skips: deps.events.skips(), multipliers: deps.events.multipliers(), halts: deps.halts.board(),
    };
  };
  return runActor({ name: "window-roller", log: deps.log, dryRun, everyMs: 5_000, pass: () => rollerPass(state, clockOf) });
}
