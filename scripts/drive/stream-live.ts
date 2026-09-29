/**
 * S4.5 live proof of the D-049 wiring: the production stream client (`openMarketStream`) against the live ops stream
 * (`https://ops.testnet.mitoshi.xyz/v1/stream`) writing into a real TanStack `QueryClient`, while a throwaway user taps a
 * live Window through the relay — the tap's `Fill`/`OrderExecuted` arrive on `market:<id>` and mark the Window's
 * snapshot, depth and row stale; price ticks land in their stream-owned keys. Prints each applied frame batch.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/stream-live.ts [seconds]
 */
import { QueryClient } from "@tanstack/react-query";
import type { MarketId } from "@cwf/core";
import { createMarketsProvider, createSubmitterSession, FULL_TEMPO_CAPS, nowSec, openMarketStream, type CacheOp } from "@cwf/markets";
import { driveClient, newPasskeyRoot } from "@cwf/markets/drive";
import { fund, restInside, wallet } from "./lib/actors";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows";
import { startLocalRelay } from "./lib/relay-server";

const STREAM = process.env.OPS_STREAM_URL ?? "https://ops.testnet.mitoshi.xyz";
const seconds = Number(process.argv[2] ?? 90);
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, atMs: Date.now(), ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();
const target = (await liveWindows(ops, venue, nowSec())).filter((w) => w.market.lockAtSec - nowSec() > 120)[0];
if (!target) throw new Error("no live Window with an open print and 2+ minutes to lock");
const marketId = target.market.marketId as MarketId;

const queryClient = new QueryClient();
const counts = { batches: 0, sets: 0, invalidations: 0, marketInvalidations: 0 };
let fillSeenAtMs: number | null = null;
const connection = openMarketStream({
  streamUrl: STREAM,
  topics: ["prices", "markets", "verdicts", "fills", `market:${marketId}`],
  queryClient,
  onStatus: (s, d) => out("status", { status: s, detail: d }),
  onBatch: (ops: CacheOp[]) => {
    counts.batches++;
    for (const op of ops) {
      if (op.kind === "set") counts.sets++;
      else {
        counts.invalidations++;
        if (JSON.stringify(op.key).includes(marketId)) {
          counts.marketInvalidations++;
          fillSeenAtMs ??= Date.now();
        }
      }
    }
    if (ops.some((o) => o.kind === "invalidate")) out("batch", { ops: ops.map((o) => `${o.kind} ${JSON.stringify(o.key)}`) });
  },
});
out("subscribed", { window: label(target), marketId, stream: STREAM });

await new Promise((r) => setTimeout(r, 8_000));
const tsla = queryClient.getQueryData(["cwf", "price", "TSLA-24"]);
out("price-cache", { "TSLA-24": tsla, BTC: queryClient.getQueryData(["cwf", "price", "BTC"]), counts });

// A real tap on the subscribed Window through the relay: its events must come back over the stream.
const relay = await startLocalRelay();
const maker = wallet("stream-maker");
await fund(maker.address);
const rested = await restInside(maker, venue.engine, marketId, target.market.lockAtSec, { ask: 5_000n, bid: 5_000n }, () => rawTop(ops, venue, marketId));
await new Promise((r) => setTimeout(r, (target.series.minRestSec + 3) * 1000));
const root = newPasskeyRoot();
await fund(root.address);
const session = createSubmitterSession({ authority: "passkey", client: driveClient(root.account as never, relay.url), caps: FULL_TEMPO_CAPS, nowSec });
const market = await provider.getMarket(marketId);
const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: target.series.cadenceSec }, "up", 1_000_000n);
if (!market.ok || !market.value || !quote.ok || !quote.value) throw new Error("no market or quote");
const before = counts.marketInvalidations;
fillSeenAtMs = null;
const tap = await session.submitter.submitOrder({ market: market.value, side: "up", stakeBase: 1_000_000n, displayedQuote: quote.value, wallet: root.address });
const landedAtMs = Date.now();
out("tap", { maker: rested?.receipt.transactionHash, status: tap.status, tx: tap.status === "confirmed" ? tap.booked.txHash : null });

const until = Date.now() + seconds * 1000;
while (Date.now() < until && counts.marketInvalidations === before) await new Promise((r) => setTimeout(r, 250));
out("summary", { counts, streamLagMs: fillSeenAtMs ? fillSeenAtMs - landedAtMs : null, tapEventsArrived: counts.marketInvalidations > before });
connection.close();
await relay.close();
process.exit(0);
