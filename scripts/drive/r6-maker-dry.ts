/**
 * R6 item 2 (D-230): the seed maker's packed quoting, run here against live Moderato books with sending disabled.
 * Every trading Window is planned as ops' maker plans it (`planWindow`: its resting orders, its paired inventory, the
 * book without them, the default depth and caps) around the book's own mid, the plans pack 16 calls a transaction
 * (fresh books first) and each pack is filled as the maker's role address would send it (`simulateOps`: every call
 * executed, gas estimated, nothing signed or sent). A refused pack is split and refilled, as the pass does. No key.
 *
 *   tsx scripts/drive/r6-maker-dry.ts [--from 0x160a25fFFA76652Ba236CE97395B4d6C51bC3FC0]
 */
import type { Address } from "viem";
import { createOpsClient, fetchMarkets, listSeries, marketIdOf, OpsSendError, simulateOps, topOfBook, venueOf } from "@cwf/markets/ops";
import { laneKey } from "@cwf/core";
import { readSeedMakerEnv } from "../../services/ops/src/actors/seed-maker/env";
import { planWindow, type Step } from "../../services/ops/src/actors/seed-maker/window";
import { packUnits, sendPacked, chainRefused, type PackUnit } from "../../services/ops/src/runtime/pack";

const i = process.argv.indexOf("--from");
const from = (i >= 0 ? process.argv[i + 1] : "0x160a25fFFA76652Ba236CE97395B4d6C51bC3FC0") as Address;
const read = createOpsClient({ network: "testnet", rpcUrl: process.env.TEMPO_RPC_HTTP_URL });
// The maker's reads ask about its own orders and inventory: the same read-only client, addressed as the maker.
const client = { ...read, address: from };
const venue = venueOf(client.chainId)!;
const env = readSeedMakerEnv({});
const nowSec = Number((await client.public.getBlock({ blockTag: "latest" })).timestamp);
const startedMs = Date.now();
const clockSec = () => nowSec + Math.floor((Date.now() - startedMs) / 1000);
const series = (await listSeries(client, venue)).filter((s) => s.symbol && s.lane && s.cadenceSec <= 3_600);
const refs = series.flatMap((s) => (s.nextIndex >= 1n ? [{ s, id: marketIdOf(s.seriesId, s.nextIndex - 1n) }, ...(s.nextIndex >= 2n ? [{ s, id: marketIdOf(s.seriesId, s.nextIndex - 2n) }] : [])] : []));
const views = await fetchMarkets(client, venue, refs.map((r) => r.id));
const trading = refs.flatMap((r, k) => {
  const m = views[k];
  return m && m.state === 0 && m.tradingStartSec <= nowSec && nowSec < m.lockAtSec - 75 && m.prints.open.source !== 0 ? [{ ...r, m }] : [];
});
console.log(`chain ${new Date(nowSec * 1000).toISOString().slice(11, 19)} · ${trading.length} trading Windows · fills as ${from} · ${env.quoteLots} lots a side`);
type Item = { label: string; step: Step };
const units: PackUnit<Item>[] = [];
for (const { s, m } of trading) {
  const top = await topOfBook(client, venue, m.marketId);
  const fair = top.bidTicks && top.askTicks ? Math.round((top.bidTicks + top.askTicks) / 2) : 500;
  const cap = s.lane === "regular" ? env.maxCashPerWindow : s.lane === "gap" ? env.gapMaxCash : env.allDayMaxCash;
  const label = `${laneKey(s.symbol!, s.lane!, s.cadenceSec)} #${m.index}`;
  const plan = await planWindow({ client, venue, env, dryRun: true, nowSec: clockSec(), clockSec, log: (w) => console.log(`  ${w}`) }, s, m, { phase: "quote", fairTicks: fair, maxCashPerWindow: cap, why: "dry run" }, null, label);
  if ("steps" in plan) units.push({ items: plan.steps.map((step) => ({ label, step })) });
  else console.log(`  ${label}: ${plan.result.note}`);
}
const packs = packUnits(units, 16);
console.log(`${units.length} Windows to quote → ${packs.length} transactions (was ${units.length})`);
const lines = await sendPacked(packs, {
  send: async (items) => `gas ${(await simulateOps(client, items.map((x) => x.step.call), from, clockSec())).gas}`,
  refused: chainRefused,
  landed: (x, note, n) => `${x.label} ${x.step.what} · fills (${note}, ${n} in tx)`,
  failed: (x, e) => `${x.label} ${x.step.what} · refused: ${e instanceof OpsSendError ? (e.errorName ?? e.message.slice(0, 100)) : String(e).slice(0, 100)}`,
  skipped: (x, after) => `${x.label} ${x.step.what} · waits for ${after.step.what}`,
}, 1);
for (const l of lines) console.log(`  ${l}`);
process.exit(0);
