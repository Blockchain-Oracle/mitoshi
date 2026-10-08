/**
 * S24.4 live check (D-194, D-204): the house's exit tail on Moderato. Follows one live Window (BTC 5m by default) through
 * its last 90 s and prints the top of book every 5 s, so the log shows both sides resting — half size, wider — from
 * lock − 75 until they lapse at lock − 30. Read-only.
 *
 *   pnpm --dir scripts exec tsx drive/exit-tail-live.ts [SYMBOL] [CADENCE_MIN]
 */
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows.js";

const symbol = (process.argv[2] ?? "BTC").toUpperCase();
const cadenceSec = Number(process.argv[3] ?? 5) * 60;
const nowSec = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { client, venue } = testnetVenue();
const windows = await liveWindows(client, venue, nowSec());
const w = windows.filter((x) => x.series.symbol === symbol && x.series.cadenceSec === cadenceSec).sort((a, b) => a.market.lockAtSec - b.market.lockAtSec)[0];
if (!w) throw new Error(`no live ${symbol} ${cadenceSec / 60}m Window`);
const lock = w.market.lockAtSec;
console.log(JSON.stringify({ window: label(w), lockAt: new Date(lock * 1000).toISOString(), secondsToLock: lock - nowSec() }));
while (nowSec() < lock - 90) await sleep(1_000);
while (nowSec() < lock - 20) {
  const top = await rawTop(client, venue, w.market.marketId);
  const left = lock - nowSec();
  const phase = left > 75 ? "full" : left > 45 ? "tail" : left > 30 ? "tail (no new)" : "lapsed";
  console.log(JSON.stringify({ toLock: left, phase, bid: top.bidTicks, bidLots: String(top.bidLots), ask: top.askTicks, askLots: String(top.askLots) }));
  await sleep(5_000);
}
