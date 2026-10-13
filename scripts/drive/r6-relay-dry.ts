/**
 * R6 item 1 (D-230): ops' `price-relay` pass, run here against live Moderato state with sending disabled — at the next
 * 5-minute boundary it fetches RedStone's packages for T, builds every due print, packs them (a close with the next
 * Window's open copied behind it, short cadences first) and fills each pack as the relay's role address would send it
 * (`simulateOps`: every call executed, gas estimated, nothing signed or sent, so no nonce or print can clash with the
 * live relay). It prints when each pass ran against T and how many transactions the boundary takes. No key is read.
 *
 *   tsx scripts/drive/r6-relay-dry.ts [--from 0x7B36b240fB262dE707CE773AB532F1457d1f0e2c] [--now] [--passes 8]
 *
 * `--from`: the address the fills run as — the deployed relay's role (`price-relay` in ops' start log). `--now` runs
 * at once instead of waiting for the boundary.
 */
import type { Address } from "viem";
import { createOpsClient, feedIdToAscii, venueOf } from "@cwf/markets/ops";
import { BoundaryCache } from "../../services/ops/src/actors/price-relay/boundary-cache";
import { relayPass, type RelayState } from "../../services/ops/src/actors/price-relay/pass";
import { loadRedstoneSources } from "../../services/ops/src/prices/redstone-gateway";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const from = arg("from", "0x7B36b240fB262dE707CE773AB532F1457d1f0e2c") as Address;
const passes = Number(arg("passes", "8"));
const client = createOpsClient({ network: "testnet", rpcUrl: process.env.TEMPO_RPC_HTTP_URL, tier: 0 });
const venue = venueOf(client.chainId);
if (!venue) throw new Error("engine not deployed on Moderato");
const sources = loadRedstoneSources();
const state: RelayState = {
  client, venue, dryRun: true, simulateFrom: from, series: [], listedMs: 0, low: new Map(), failures: new Map(), missed: new Set(), recent: [], openLags: [], stall: null, log: (why) => console.log(`  log: ${why}`),
  counters: { recorded: 0, copied: 0, already: 0, failed: 0, missed: 0 },
  proofs: {
    sources, sql: null, engine: venue.engine, chainId: client.chainId, network: "testnet", attestor: null, attested: false, datastreams: null,
    cache: new BoundaryCache(sources, () => [...new Set(state.series.map((s) => feedIdToAscii(s.versions[0]?.primary.feedId ?? "0x")))]),
  },
};
const clock = async () => Number((await client.public.getBlock({ blockTag: "latest" })).timestamp);
const stamp = (t: number) => new Date(t * 1000).toISOString().slice(11, 19);

let now = await clock();
const boundary = process.argv.includes("--now") ? now - (now % 300) : now - (now % 300) + 300;
console.log(`chain ${stamp(now)} · boundary T ${stamp(boundary)} · fills as ${from} · gateways ${sources.gateways.map((g) => new URL(g.url).host).join(", ")}`);
if (now < boundary + 3) {
  // Warm the Series list before T, then wait for T + 3 s (the relay's first ask, REDSTONE_FETCH_AFTER_SEC).
  await relayPass(state, now).catch(() => null);
  const waitMs = (boundary + 3 - now) * 1000;
  console.log(`waiting ${Math.ceil(waitMs / 1000)} s for T + 3 s`);
  await new Promise((r) => setTimeout(r, waitMs));
}
for (let i = 0; i < passes; i++) {
  now = await clock();
  const t0 = Date.now();
  const r = await relayPass(state, now);
  const d = r.detail as { due: number; txs: number; stall: unknown };
  const [summary, ...lines] = r.why.split(" | ");
  console.log(`\npass ${i + 1} at T + ${now - boundary} s (${((Date.now() - t0) / 1000).toFixed(1)} s): ${summary}`);
  const fills = lines.filter((l) => l.includes("fills ("));
  const refused = lines.filter((l) => l.includes("refused"));
  const waiting = lines.filter((l) => l.includes("waiting"));
  console.log(`  ${d.due} due → ${d.txs} transactions · ${fills.length} prints fill · ${refused.length} refused · ${waiting.length} waiting${d.stall ? ` · STALL ${JSON.stringify(d.stall)}` : ""}`);
  for (const l of [...fills.slice(0, 6), ...refused.slice(0, 6), ...waiting.slice(0, 3)]) console.log(`  ${l}`);
  if (d.due > 0 && fills.length + refused.length >= d.due) break;
  await new Promise((res) => setTimeout(res, Math.min(r.nextDelayMs ?? 1_500, 3_000)));
}
process.exit(0);
