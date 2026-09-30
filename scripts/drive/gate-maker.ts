/**
 * S4 gate helper: resting liquidity for the UI gate's calls (F-S4-05 — the S3 seed maker quotes 5 lots a side, which
 * the gate's own taps drain). A throwaway maker, funded by the faucet, rests PostOnly quotes inside the spread on every
 * Trading 5-minute Window (crypto, 24/7 stock, NYSE-session stock) once, real orders on the real book, self-paid.
 * Receipts go to stdout for `acceptance/S4.md`. Runs until stopped.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/gate-maker.ts
 */
import { fund, restInside, wallet } from "./lib/actors";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows";

const LOTS = { ask: 4_000n, bid: 4_000n };
const { client, venue } = testnetVenue();
const maker = wallet("gate-maker");
await fund(maker.address);
console.log(JSON.stringify({ step: "maker", address: maker.address }));
const quoted = new Set<string>();

for (;;) {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const windows = await liveWindows(client, venue, nowSec, 2);
    for (const w of windows) {
      if (w.series.cadenceSec !== 300 || quoted.has(w.market.marketId) || w.market.lockAtSec - nowSec < 60) continue;
      quoted.add(w.market.marketId);
      const r = await restInside(maker, venue.engine, w.market.marketId, w.market.lockAtSec, LOTS, () => rawTop(client, venue, w.market.marketId)).catch((e: Error) => {
        console.log(JSON.stringify({ step: "skip", window: label(w), why: e.message.slice(0, 120) }));
        return null;
      });
      if (r) console.log(JSON.stringify({ step: "rested", window: label(w), askYes: r.askYes, bidYes: r.bidYes, tx: r.receipt.transactionHash }));
    }
  } catch (error) {
    console.log(JSON.stringify({ step: "error", why: String(error).slice(0, 160) }));
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
