/**
 * S4.1 live proof: the engine relay policy and the provider/order lane on Moderato against a live S3 Window.
 *
 *   1. provider reads (lanes through the lens fallback, the snapshot, depth, a fresh quote);
 *   2. a passkey-shaped user taps Up through `submitOrder`: `[approve(engine, exact), placeOrder(IOC)]`, fee paid by the
 *      relay (receipt `feePayer` = the relay);
 *   3. refusals, each with the relay's own verdict: `mintSet` (capital intake, `never`), an approval to the lens
 *      (`approve-spender`), and `placeOrder` from a markets-restricted region (`region`) while `redeem`-class exits pass;
 *      a refused sponsorship is never paid by the relay (the SDK falls back to the sender paying, receipt shows it);
 *   4. the balance sheet, open positions and claimables after the tap.
 *
 *   pnpm --filter @cwf/scripts exec tsx drive/relay-engine.ts
 */
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import type { MarketId } from "@cwf/core";
import { createMarketsProvider, createSubmitterSession, FULL_TEMPO_CAPS, nowSec, PATH_USD, sendBatch } from "@cwf/markets";
import { driveClient, newPasskeyRoot } from "@cwf/markets/drive";
import { fund, insideQuotes, reader, restQuotes, wallet } from "./lib/actors";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows";
import { startLocalRelay, type LocalRelay } from "./lib/relay-server";

const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const relay = await startLocalRelay();
const restricted = await startLocalRelay({ region: "restricted" });
const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();

// 1. Reads.
const lanes = await provider.listLiveLanes();
out("lanes", lanes.ok ? { lanes: lanes.value.lanes.map((l) => ({ label: `${l.basis} ${l.label}`, windows: l.markets.length })) } : { error: lanes.error });
const target = (await liveWindows(ops, venue, nowSec())).filter((w) => w.market.lockAtSec - nowSec() > 180)[0];
if (!target) throw new Error("no live Window with an open print and 3+ minutes to lock");
const marketId = target.market.marketId as MarketId;
const maker = wallet("relay-maker");
await fund(maker.address);
const { askYes, bidYes } = insideQuotes(await rawTop(ops, venue, marketId));
const quotes = restQuotes(maker, venue.engine, marketId, target.market.lockAtSec, [{ kind: 2, yesTicks: askYes, lots: 10_000n }, { kind: 0, yesTicks: bidYes, lots: 5_000n }]);
out("maker-quotes", { window: label(target), marketId, maker: maker.address, tx: quotes.transactionHash, askYes, bidYes });
await new Promise((r) => setTimeout(r, (target.series.minRestSec + 3) * 1000));
const [onchain, depth] = await Promise.all([provider.getOnchain(marketId), provider.getBookDepth({ marketId, decimals: 6 }, 3)]);
out("reads", { onchain: onchain.ok ? { status: onchain.value.status, open: onchain.value.prints.open, lockAtSec: onchain.value.lockAtSec, seq: onchain.value.seq } : onchain.error, depth: depth.ok ? { upAsks: depth.value.upAsks, upBids: depth.value.upBids } : depth.error });
const market = await provider.getMarket(marketId);
if (!market.ok || !market.value) throw new Error("Window did not read");
const quote = await provider.freshQuoteStake({ marketId, decimals: 6, intervalSec: market.value.intervalSec }, "up", 1_000_000n);
if (!quote.ok || !quote.value) throw new Error(`no quote: ${JSON.stringify(quote)}`);
out("quote", { quote: quote.value });

// 2. The sponsored tap.
const root = newPasskeyRoot();
const faucet = await fund(root.address);
const session = createSubmitterSession({ authority: "passkey", client: driveClient(root.account as never, relay.url), caps: FULL_TEMPO_CAPS, nowSec });
const tap = await session.submitter.submitOrder({ market: market.value, side: "up", stakeBase: 1_000_000n, displayedQuote: quote.value, wallet: root.address });
if (tap.status !== "confirmed") throw new Error(`tap: ${JSON.stringify(tap, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
const receipt = await reader.getTransactionReceipt({ hash: tap.booked.txHash });
out("tap", { user: root.address, faucet, tx: tap.booked.txHash, booked: tap.booked, gasUsed: receipt.gasUsed, feePayer: (receipt as { feePayer?: string }).feePayer, relay: relay.feePayer });

// 3. Refusals: the relay's verdict for each, then who (if anyone) paid.
async function attempt(name: string, via: LocalRelay, calls: { to: Address; data: Hex }[]) {
  const before = via.verdicts.length;
  const client = driveClient(root.account as never, via.url);
  try {
    const sent = await sendBatch(client, { calls, sponsored: true, nonce: { kind: "expiring" }, nowSec: nowSec() });
    const r = sent.receipt as { feePayer?: string; status: string; gasUsed: bigint };
    out("attempt", { name, verdicts: via.verdicts.slice(before).map((v) => (v.verdict.ok ? "ok" : `${v.verdict.code}: ${v.verdict.reason}`)), tx: sent.hash, status: r.status, feePayer: r.feePayer, paidByRelay: r.feePayer?.toLowerCase() === via.feePayer.toLowerCase() });
  } catch (error) {
    out("attempt", { name, verdicts: via.verdicts.slice(before).map((v) => (v.verdict.ok ? "ok" : `${v.verdict.code}: ${v.verdict.reason}`)), error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) });
  }
}
const engineCall = (functionName: string, args: readonly unknown[]) => ({ to: venue.engine, data: encodeFunctionData({ abi: eventsEngineAbi, functionName: functionName as never, args: args as never }) });
await attempt("mintSet (capital intake)", relay, [{ to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [venue.engine, 1_000_000n] }) }, engineCall("mintSet", [marketId, 1_000n, false])]);
await attempt("approve(lens) + cancelAll", relay, [{ to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [venue.lens, 1n] }) }, engineCall("cancelAll", [marketId, 16, true])]);
const expire = Math.min(target.market.lockAtSec, nowSec() + 30);
const restrictedPlace = engineCall("placeOrder", [{ marketId, kind: 0, orderType: 3, selfMatch: 0, priceTicks: 1, lots: 1_000n, expireTs: expire, maxFills: 16, maxEvictions: 16, useCredit: false, withdrawProceeds: false, clientId: 9n }]);
await attempt("placeOrder from a restricted region", restricted, [{ to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [venue.engine, 1_000n] }) }, restrictedPlace]);
await attempt("cancelAll from a restricted region (an exit)", restricted, [engineCall("cancelAll", [marketId, 16, true])]);

// 4. The wallet after the tap.
const [sheet, positions, claimables] = await Promise.all([provider.getBalanceSheet(root.address), provider.listOpenPositions(root.address), provider.listClaimables(root.address)]);
out("wallet", { sheet: sheet.ok ? sheet.value : sheet.error, positions: positions.ok ? positions.value : positions.error, claimables: claimables.ok ? claimables.value : claimables.error });
out("verdicts", { open: relay.verdicts.map((v) => `${v.method}:${v.verdict.ok ? "ok" : v.verdict.code}`), restricted: restricted.verdicts.map((v) => `${v.method}:${v.verdict.ok ? "ok" : v.verdict.code}`) });
await Promise.all([relay.close(), restricted.close()]);
process.exit(0);
