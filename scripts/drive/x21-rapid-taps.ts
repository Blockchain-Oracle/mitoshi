/**
 * Spike X21 (S4): five orders from one wallet-mode key within 2 s. Each is its own Tempo transaction with an expiring
 * nonce set explicitly — `nonceKey = maxUint256`, `nonce = 0`, `validBefore ≤ now + 25 s` — so none waits on another
 * (no sequence to serialize on), and each is decided by its own window. Sent through the production order lane
 * concurrently (the session queues only protocol nonces), sponsored by the relay, against a live S3 Window.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/x21-rapid-taps.ts
 */
import { maxUint256 } from "viem";
import type { MarketId } from "@cwf/core";
import { createJournal, createMarketsProvider, createMemoryStore, createSubmitterSession, FULL_TEMPO_CAPS, nowMs, nowSec, PATH_USD, walletKeyAuthorization } from "@cwf/markets";
import { driveClient, newPasskeyRoot, newWalletModeKey, signWalletKeyAuthorization } from "@cwf/markets/drive";
import { fund, insideQuotes, reader, restQuotes, wallet } from "./lib/actors";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows";
import { startLocalRelay } from "./lib/relay-server";

const STAKE = 1_000_000n;
const TAPS = 5;
const SPACING_MS = Number(process.env.X21_SPACING_MS ?? 300); // five taps across 1.2 s
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

const relay = await startLocalRelay();
const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();
const target = (await liveWindows(ops, venue, nowSec())).filter((w) => w.market.lockAtSec - nowSec() > 180)[0];
if (!target) throw new Error("no live Window with an open print and 3+ minutes to lock");
const marketId = target.market.marketId as MarketId;
const maker = wallet("x21-maker");
await fund(maker.address);
const { askYes, bidYes } = insideQuotes(await rawTop(ops, venue, marketId));
const q = restQuotes(maker, venue.engine, marketId, target.market.lockAtSec, [{ kind: 2, yesTicks: askYes, lots: 30_000n }, { kind: 0, yesTicks: bidYes, lots: 5_000n }]);
out("setup", { window: label(target), marketId, maker: maker.address, makerTx: q.transactionHash });
await new Promise((r) => setTimeout(r, (target.series.minRestSec + 3) * 1000));

const root = newPasskeyRoot();
await fund(root.address);
const key = await newWalletModeKey(root.address);
const pending = { current: (await signWalletKeyAuthorization(root, key, walletKeyAuthorization({ engine: venue.engine, pathUsd: PATH_USD, nowSec: nowSec() }))) as unknown };
// A journal on the chain-corrected clock, so each record's time is the lane's own `nowSec` when it built the tx.
const store = createMemoryStore();
const session = createSubmitterSession({ authority: "access-key", client: driveClient(key.account as never, relay.url), caps: FULL_TEMPO_CAPS, nowSec, pendingKeyAuthorization: pending, journal: createJournal(store, nowMs) });
const market = await provider.getMarket(marketId);
if (!market.ok || !market.value) throw new Error("Window did not read");
const m = market.value;
const tap = async () => {
  const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: m.intervalSec }, "up", STAKE);
  if (!quote.ok || !quote.value) throw new Error("no quote");
  return session.submitter.submitOrder({ market: m, side: "up", stakeBase: STAKE, displayedQuote: quote.value, wallet: root.address });
};

// The arm: the key's first tap publishes its authorization (D-136); then the five rapid taps.
const arm = await tap();
out("arm", { status: arm.status, tx: arm.status === "confirmed" ? arm.booked.txHash : null });

const t0 = Date.now();
const startedMs: number[] = [];
const results = await Promise.all(
  Array.from({ length: TAPS }, async (_, i) => {
    await new Promise((r) => setTimeout(r, i * SPACING_MS));
    startedMs.push(Date.now() - t0);
    const outcome = await tap();
    return { i, doneMs: Date.now() - t0, outcome };
  }),
);
for (const r of results) {
  if (r.outcome.status !== "confirmed") {
    out(`tap-${r.i + 1}`, { status: r.outcome.status, doneMs: r.doneMs, diagnosis: "diagnosis" in r.outcome ? r.outcome.diagnosis : null });
    continue;
  }
  const hash = r.outcome.booked.txHash;
  const [tx, receipt] = await Promise.all([reader.getTransaction({ hash }), reader.getTransactionReceipt({ hash })]);
  const t = tx as unknown as { nonceKey?: bigint; nonce: number; validBefore?: number | bigint; feePayerSignature?: unknown };
  const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
  // The lane stamps `validBefore` from the chain-corrected clock when it builds the tx; the journal records that build.
  const record = store.load().find((j) => j.txHash === hash);
  out(`tap-${r.i + 1}`, {
    tx: hash, doneMs: r.doneMs, block: receipt.blockNumber, blockTime: block.timestamp, gasUsed: receipt.gasUsed, feePayer: (receipt as { feePayer?: string }).feePayer,
    nonceKey: t.nonceKey === maxUint256 ? "maxUint256" : t.nonceKey, nonce: t.nonce, validBefore: t.validBefore, builtAtSec: record ? Math.floor(record.createdAtMs / 1000) : null,
    validForSec: record ? Number(t.validBefore) - Math.floor(record.createdAtMs / 1000) : null, marginAtInclusionSec: Number(t.validBefore) - Number(block.timestamp),
    contractsRaw: r.outcome.booked.contractsRaw,
  });
}
out("summary", { startedMs, spanMs: Math.max(...startedMs) - Math.min(...startedMs), confirmed: results.filter((r) => r.outcome.status === "confirmed").length, relay: relay.feePayer });
await relay.close();
process.exit(0);
