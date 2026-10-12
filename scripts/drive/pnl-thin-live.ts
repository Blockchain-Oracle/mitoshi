#!/usr/bin/env -S pnpm exec tsx
/**
 * R4-1 (D-227) live proof on Moderato of the two P&L rules a plain trade never reaches: a thin book and a Boost's
 * partial close. The house maker rests about five contracts a side on a stock Window, so a holding larger than the bids
 * is a thin book on demand — no house quote is moved. A fresh maker rests an ask and a bid inside the spread; a fresh
 * trader buys 15 contracts in the wallet and opens a 2× Boost of about 12 (both off the maker's ask; the Boost healthy at
 * birth over the maker's bid), then the maker swaps its bid for a smaller one, so the book takes only part of either:
 *   wallet  P&L = what Close pays for the part the book takes − that part's share of the open cost; equity counts the
 *           rest at cost; TP/SL judge the whole holding at the walk's price (the tab's rule and the keeper's `judge`)
 *   Boost   the filled part's mark − its share of the front − its share of the stake; its Close sells what fills,
 *           repays the front first and stays live — after which what is still in is stake − returned
 * Then the Boost's last close (its round in the one account history: returned − stake) and the wallet's Close on a thin
 * book (it sells what fills; the rest stays open at the rest of the cost, the ledger's fill-by-fill average cost).
 * The app's figures are its own reads (`listOpenPositions`, `freshExitQuote`, `markOf`, `positionOf`,
 * `listAccountHistory`) through its own kernels (`walkWorth`, `boostWorth`, the keeper's `judge`); the chain's are the
 * lens's bid levels walked by hand and the receipts (`OrderExecuted`, `Fill`, `Opened`, `Exited`).
 * Throwaway keys in 0600 files (never printed); every step is a real Tempo testnet transaction. `--pause <path>` waits
 * at each read for `<path>-<step>` to exist (a browser look at the same state).
 *
 *   pnpm --dir scripts exec tsx drive/pnl-thin-live.ts [--wallet 15000] [--boost 12000] [--thin 4000] [--pause <path>]
 */
import { existsSync } from "node:fs";
import { encodeFunctionData, parseEventLogs, type Hex } from "viem";
import type { MarketId } from "@cwf/core";
import { cashOutCall, createMarketsProvider, decodeEngineEvents, listAccountHistory, nowSec, walletOrderCalls } from "@cwf/markets";
import { encodeLeverageIntent, getLeverageMark, getLeveragePosition, getLeverageReserveState, previewBoostFair, previewLeverageOpen } from "@cwf/markets/leverage";
import { readFairModels } from "@cwf/markets/parlay";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { leverageReserveAbi } from "@cwf/clients/abis/LeverageReserve";
import { judge } from "../../services/ops/src/actors/exit-keeper/decide";
import { boostWorth, closeFloorBase, exitHit, walkWorth } from "../../web/src/features/terminal/position-value";
import { castBatch, PATH_USD, type CastReceipt } from "../lib/cast.js";
import { fund, restQuotes, wallet } from "./lib/actors.js";
import { label, liveWindows, rawTop, testnetVenue } from "./lib/live-windows.js";
import { latestSpot } from "./lib/spot.js";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const WALLET_LOTS = BigInt(arg("--wallet", "15000"));
const BOOST_LOTS = BigInt(arg("--boost", "12000"));
const THIN_LOTS = BigInt(arg("--thin", "4000"));
const PAUSE = process.argv.includes("--pause") ? arg("--pause", "") : null;
const LEVERAGE_BPS = 20_000;
const CLOSE_TOLERANCE_BPS = 100; // the terminal's default close tolerance (settings.ts)
const out = (step: string, data: Record<string, unknown>) => console.log(JSON.stringify({ step, atSec: nowSec(), ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (r: CastReceipt, step: string) => {
  if (r.status !== "0x1" && r.status !== "1" && r.status !== "success") throw new Error(`${step} reverted: ${r.transactionHash}`);
  return r;
};
const pause = async (step: string) => {
  if (!PAUSE) return;
  out("pause", { waitingFor: `${PAUSE}-${step}` });
  for (const until = Date.now() + 6 * 60_000; Date.now() < until && !existsSync(`${PAUSE}-${step}`); ) await sleep(2_000);
};

const provider = createMarketsProvider();
await provider.syncClock();
const { client: ops, venue } = testnetVenue();
const reserve = await getLeverageReserveState();
if (!reserve.ok || !reserve.value) throw new Error("no LeverageReserve on Moderato");
const params = reserve.value.params;

// A Window with a fair-value feed (a Boost proves its entry against it), the house quoting both sides with room inside
// the spread, and ten minutes to lock (most time left first).
let w: Awaited<ReturnType<typeof liveWindows>>[number] | undefined;
let feed: string | null = null;
for (const until = Date.now() + 10 * 60_000; Date.now() < until && !w; await sleep(w ? 0 : 15_000)) {
  const live = (await liveWindows(ops, venue, nowSec())).filter((x) => x.market.lockAtSec - nowSec() > 600 && x.top.bidLots > 0n && x.top.askLots > 0n && x.top.askTicks - x.top.bidTicks >= 14);
  const models = await readFairModels(live.map((x) => x.series.seriesId));
  w = live.find((x) => models.get(x.series.seriesId.toLowerCase())?.feed);
  feed = w ? models.get(w.series.seriesId.toLowerCase())!.feed : null;
}
if (!w || !feed) throw new Error("no quoted Window with a feed and ten minutes to lock");
const marketId = w.market.marketId;
const { lotBase, tickBase, cashUnit } = w.series;
const ONE = 1_000_000n;
out("window", { window: label(w), marketId, feed, lockAtSec: w.market.lockAtSec, lotBase, tickBase, cashUnit, house: w.top });

// The lens's YES bids: every live order (what a wallet's exit walks, TAKER_MIN_REST_SEC = 0) and the rested ones (what
// the reserve's `markOf` walks, max(Series, params) minRestSec).
const restSec = Math.max(w.series.minRestSec, params.minRestSec);
type Levels = { ticks: number[]; lots: bigint[] };
const bidsOf = async (rest: number): Promise<Levels> => {
  const [ticks, lots] = (await ops.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "levels", args: [marketId, true, 32n, rest, 512n] })) as unknown as [readonly number[], readonly bigint[]];
  return { ticks: ticks.map(Number), lots: [...lots] };
};
const key = (l: Levels) => l.ticks.map((t, i) => `${t}x${l.lots[i]}`).join(",");
/** The walk by hand: lots × ticks per level, best first, until `wantLots` are sold. */
const walk = (l: Levels, wantLots: bigint) => {
  let left = wantLots;
  let lotTicks = 0n;
  for (let i = 0; i < l.ticks.length && left > 0n; i++) {
    const take = l.lots[i]! < left ? l.lots[i]! : left;
    lotTicks += take * BigInt(l.ticks[i]!);
    left -= take;
  }
  return { filledLots: wantLots - left, lotTicks };
};
/**
 * A read taken between two identical bid books with every bid rested, so the hand walk, the app's reads, the reserve's
 * `markOf` (rested bids) and its Close (every live bid) all see one book — a house re-quote younger than minRestSec
 * would otherwise sit in the Close's walk and not in the mark.
 */
async function steady<T>(read: () => Promise<T>): Promise<{ value: T; live: Levels; rested: Levels }> {
  for (let i = 0; i < 30; i++) {
    const [live, rested] = await Promise.all([bidsOf(0), bidsOf(restSec)]);
    if (key(live) !== key(rested)) {
      await sleep(3_000);
      continue;
    }
    const value = await read();
    const [live2, rested2] = await Promise.all([bidsOf(0), bidsOf(restSec)]);
    if (key(live) === key(live2) && key(rested) === key(rested2)) return { value, live, rested };
    await sleep(2_000);
  }
  throw new Error("the book kept moving under the read");
}

// The maker: an ask and a bid inside the house's spread (five ticks either side of its mid), PostOnly.
const maker = wallet("pnl-thin-maker");
await fund(maker.address);
const top = await rawTop(ops, venue, marketId);
const mid = Math.floor((top.bidTicks + top.askTicks) / 2);
const askYes = Math.min(mid + 5, top.askTicks - 1);
const bidYes = Math.max(mid - 5, top.bidTicks + 1);
const restedId = (r: CastReceipt, kind: number) => decodeEngineEvents(venue.engine, r.logs as never).executed.find((e) => e.kind === kind)?.result.restedOrderId ?? 0n;
const quotes = restQuotes(maker, venue.engine, marketId, w.market.lockAtSec, [{ kind: 2, yesTicks: askYes, lots: WALLET_LOTS + BOOST_LOTS * 2n }, { kind: 0, yesTicks: bidYes, lots: BOOST_LOTS + BOOST_LOTS / 2n }]);
let bidId = restedId(quotes, 0);
out("maker", { address: maker.address, tx: quotes.transactionHash, askYes, bidYes, bidOrderId: bidId });
await sleep((restSec + 3) * 1000);

// The trader: the terminal's one-tap Up in the wallet, then a 2× Boost Up (the app's own encoder; a fresh signed spot).
const trader = wallet("pnl-thin-trader");
await fund(trader.address);
out("trader", { address: trader.address });
const send = (calls: readonly { to: `0x${string}`; data: `0x${string}` }[], step: string) => ok(castBatch(calls, { signer: { walletFile: trader.file } }), step);
const buyR = send(walletOrderCalls({ engine: venue.engine, collateral: PATH_USD, marketId, side: "up", ownLimitTicks: askYes, lots: WALLET_LOTS, maxCostBase: WALLET_LOTS * BigInt(askYes) * cashUnit, creditBase: 0n, expireTsSec: w.market.lockAtSec, clientId: 1n }), "wallet buy");
const buy = decodeEngineEvents(venue.engine, buyR.logs as never).executed[0]!;
out("wallet-buy", { tx: buyR.transactionHash, filledLots: buy.result.filledLots, cashSpent: buy.result.cashSpent });

const pre = await previewLeverageOpen(marketId as MarketId, "up", BOOST_LOTS * lotBase, LEVERAGE_BPS, params.maintenanceBps);
if (!pre.ok) throw new Error(`the reserve refuses the Boost: ${pre.error.errorName ?? pre.error.technical}`);
const spot = await latestSpot(feed);
const fair = await previewBoostFair(marketId, "up", spot.medianE8);
out("boost-quote", { quantityRaw: pre.value.quantityRaw, priceRaw: pre.value.priceRaw, stakeBase: pre.value.stakeBase, frontedBase: pre.value.frontedBase, fairRaw: fair, slackRaw: params.fairSlackRaw, spotTsSec: spot.tsSec });
const openEnc = encodeLeverageIntent({ kind: "leverage-open", marketId: marketId as MarketId, side: "up", stakeBase: pre.value.stakeBase, leverageBps: LEVERAGE_BPS, minQuantityRaw: (pre.value.quantityRaw * 99n) / 100n, spotProof: spot.payload }, { chainId: 42431, wallet: trader.address });
if (!openEnc?.ok) throw new Error("the Boost open did not encode");
const openR = send(openEnc.value.calls, "boost open");
const opened = parseEventLogs({ abi: leverageReserveAbi, eventName: "Opened", logs: openR.logs as never })[0]!.args;
const positionId = opened.positionId;
out("boost-open", { tx: openR.transactionHash, positionId, quantityRaw: opened.quantityRaw, stake: opened.stake, fronted: opened.fronted, premium: opened.premium, costRaw: opened.costRaw });

// The book thins: the maker swaps its bid for a smaller one; once it has rested, neither holding fills whole.
const thin = async (lots: bigint, step: string) => {
  const cancel = { to: venue.engine, data: encodeFunctionData({ abi: eventsEngineAbi, functionName: "cancelOrders", args: [marketId, [bidId], true] }) };
  const c = ok(castBatch([cancel], { signer: { walletFile: maker.file } }), `${step} cancel`);
  const r = restQuotes(maker, venue.engine, marketId, w!.market.lockAtSec, [{ kind: 0, yesTicks: bidYes, lots }]);
  bidId = restedId(r, 0);
  out(step, { cancelTx: c.transactionHash, restTx: r.transactionHash, bidYes, lots, bidOrderId: bidId });
  await sleep((restSec + 3) * 1000);
};
await thin(THIN_LOTS, "thin-book");

// Read A — both holdings on the thin book. The wallet row's open cost waits for the index (the lens balance is head-fresh).
let row: Awaited<ReturnType<typeof provider.listOpenPositions>> | null = null;
const rowOf = () => (row?.ok ? row.value.find((x) => x.marketId.toLowerCase() === marketId.toLowerCase()) : undefined);
const heldRaw = buy.result.filledLots * lotBase;
for (let i = 0; i < 40; i++) {
  row = await provider.listOpenPositions(trader.address);
  const p = rowOf();
  if (p && !p.costStale && p.balanceUpRaw === heldRaw && p.costUpBase === buy.result.cashSpent) break;
  await sleep(3_000);
}
const p = rowOf();
if (!p || p.costStale) throw new Error("the index never caught up with the wallet buy");
const readA = await steady(async () => ({
  exit: await provider.freshExitQuote({ marketId: marketId as MarketId, decimals: 6 }, "up", p.balanceUpRaw),
  boost: await getLeveragePosition(positionId),
  mark: await getLeverageMark(positionId),
}));
const exitA = readA.value.exit.ok ? readA.value.exit.value : null;
const bA = readA.value.boost.ok ? readA.value.boost.value : null;
const mA = readA.value.mark.ok ? readA.value.mark.value : null;
if (!exitA || !bA || !mA) throw new Error("a thin-book read failed");

// Wallet: the app's kernel on its reads, the same figures by hand off the lens, and what the old rule showed — with a
// stop-loss at 80 % of the open cost judged by the tab's rule, the keeper's `judge` and the old rule (proceeds alone).
const cost = p.costUpBase;
const walletCheck = (tag: string, exit: NonNullable<typeof exitA>, live: Levels) => {
  const app = walkWorth({ valueBase: exit.proceedsBase, contractsRaw: exit.contractsRaw, heldRaw: p.balanceUpRaw, costBase: cost });
  const h = walk(live, p.balanceUpRaw / lotBase);
  const soldRaw = h.filledLots * lotBase;
  const proceeds = h.lotTicks * cashUnit;
  const chain = { proceeds, soldRaw, pnl: proceeds - (cost * soldRaw) / p.balanceUpRaw, equity: proceeds + (cost * (p.balanceUpRaw - soldRaw)) / p.balanceUpRaw, trigger: (proceeds * p.balanceUpRaw) / soldRaw, fillablePct: Number((soldRaw * 100n) / p.balanceUpRaw) };
  const sl = (cost * 80n) / 100n;
  const keeper = judge({ side: "up", takeProfitBase: null, stopLossBase: sl, trailBps: null }, { heldRaw: p.balanceUpRaw, window: { trading: true, lockAtSec: w!.market.lockAtSec, lotBase }, exit: { proceedsBase: exit.proceedsBase, contractsRaw: exit.contractsRaw } }, nowSec(), false);
  out(`${tag}-wallet`, { bids: key(live), heldRaw: p.balanceUpRaw, openCost: cost, app: { closePays: exit.proceedsBase, sells: exit.contractsRaw, ...app }, chain, oldRule: { pnl: exit.proceedsBase - cost, equity: exit.proceedsBase }, stopLoss80: { sl, tab: exitHit(app.triggerValueBase!, null, sl), keeper: keeper.kind, oldRule: exitHit(exit.proceedsBase, null, sl) } });
  out(`${tag}-wallet-match`, { closePays: exit.proceedsBase === chain.proceeds, sells: exit.contractsRaw === chain.soldRaw, pnl: app.pnlBase === chain.pnl, equity: app.equityBase === chain.equity, trigger: app.triggerValueBase === chain.trigger, fillablePct: app.fillablePct === chain.fillablePct });
};
walletCheck("A", exitA, readA.live);

// Boost: `markOf` walks the rested bids (cost rounded up, less one unit — never in the owner's favour).
const boostApp = (b: typeof bA, m: typeof mA) => boostWorth({ markBase: m.markBase, filledRaw: m.filledRaw, heldRaw: b.quantityRaw, frontedBase: b.frontedBase, costBase: b.stakeBase - b.returnedBase, stakeBase: b.stakeBase });
const boostHand = (b: typeof bA, rested: Levels) => {
  const h = walk(rested, b.quantityRaw / lotBase);
  const weighted = h.lotTicks * lotBase * tickBase; // Σ quantityRaw × priceRaw
  const markRaw = weighted === 0n ? 0n : (weighted + ONE - 1n) / ONE - 1n;
  const filled = h.filledLots * lotBase;
  const costIn = b.stakeBase - b.returnedBase;
  const frontShare = filled >= b.quantityRaw ? b.frontedBase : (b.frontedBase * filled) / b.quantityRaw;
  const costShare = filled >= b.quantityRaw ? costIn : (costIn * filled) / b.quantityRaw;
  const owner = markRaw > frontShare ? markRaw - frontShare : 0n;
  return { markRaw, filledRaw: filled, closePaysOwner: markRaw > b.frontedBase ? markRaw - b.frontedBase : 0n, costIn, pnl: owner - costShare, fillablePct: Number((filled * 100n) / b.quantityRaw) };
};
const bAppA = boostApp(bA, mA);
const bHandA = boostHand(bA, readA.rested);
out("A-boost", { bids: key(readA.rested), position: { quantityRaw: bA.quantityRaw, stake: bA.stakeBase, fronted: bA.frontedBase, returned: bA.returnedBase }, app: { markBase: mA.markBase, filledRaw: mA.filledRaw, ...bAppA }, chain: bHandA, oldRule: { pnl: bAppA.valueBase - bA.stakeBase } });
out("A-boost-match", { mark: mA.markBase === bHandA.markRaw, filled: mA.filledRaw === bHandA.filledRaw, closePays: bAppA.valueBase === bHandA.closePaysOwner, pnl: bAppA.pnlBase === bHandA.pnl, fillablePct: bAppA.fillablePct === bHandA.fillablePct });
await pause("thin");

// The Boost's Close, as the terminal's: the floor off a fresh mark (less the close tolerance); it sells what fills.
const closeBoost = async (step: string): Promise<{ status: number; returned: bigint }> => {
  for (let attempt = 1; ; attempt++) {
    const { value } = await steady(async () => ({ m: await getLeverageMark(positionId), b: await getLeveragePosition(positionId) }));
    const { m, b } = value;
    if (!m.ok || !b.ok || !b.value || m.value.filledRaw === 0n) throw new Error(`${step}: no bids for the Boost`);
    const quoted = m.value.markBase > b.value.frontedBase ? m.value.markBase - b.value.frontedBase : 0n;
    const enc = encodeLeverageIntent({ kind: "leverage-close", positionId, marketId: marketId as MarketId, minProceedsBase: closeFloorBase(m.value.markBase, CLOSE_TOLERANCE_BPS) }, { chainId: 42431, wallet: trader.address });
    if (!enc?.ok) throw new Error("the Boost close did not encode");
    let r: CastReceipt;
    try {
      r = send(enc.value.calls, step);
    } catch (error) {
      // The house re-quoted between the read and the block (`Slippage`): the terminal's requote — read again, resend.
      if (attempt >= 6 || !/Slippage/.test(String(error))) throw error;
      out(`${step}-requote`, { attempt, why: /Slippage\([^)]*\)/.exec(String(error))?.[0] });
      await sleep(3_000);
      continue;
    }
    const e = parseEventLogs({ abi: leverageReserveAbi, eventName: "Exited", logs: r.logs as never })[0]!.args;
    // The reserve's mark rounds its walk up and takes one unit off: Close pays the owner the quote, or one unit more.
    out(step, { tx: r.transactionHash, status: e.status, soldRaw: e.quantitySoldRaw, proceeds: e.proceeds, reclaimed: e.reclaimed, returned: e.returned, quote: { markBase: m.value.markBase, filledRaw: m.value.filledRaw, ownerBase: quoted }, match: { soldWhatFilled: e.quantitySoldRaw === m.value.filledRaw, frontFirst: e.reclaimed === (e.proceeds < b.value.frontedBase ? e.proceeds : b.value.frontedBase), paidTheQuote: e.returned - quoted <= 1n && e.returned >= quoted } });
    return e;
  }
};
const partial = await closeBoost("boost-partial-close");
out("boost-partial", { stillLive: partial.status === 0 });

// The maker rests a bid again (the Boost's remainder fills whole; the wallet's 15 do not), then Read B.
await thin(BOOST_LOTS / 2n, "rebid");
const readB = await steady(async () => ({
  exit: await provider.freshExitQuote({ marketId: marketId as MarketId, decimals: 6 }, "up", p.balanceUpRaw),
  boost: await getLeveragePosition(positionId),
  mark: await getLeverageMark(positionId),
}));
const bB = readB.value.boost.ok ? readB.value.boost.value : null;
const mB = readB.value.mark.ok ? readB.value.mark.value : null;
const exitB = readB.value.exit.ok ? readB.value.exit.value : null;
if (!bB || !mB || !exitB) throw new Error("the read after the partial close failed");
walletCheck("B", exitB, readB.live);
const bAppB = boostApp(bB, mB);
const bHandB = boostHand(bB, readB.rested);
out("B-boost", { bids: key(readB.rested), position: { status: bB.status, quantityRaw: bB.quantityRaw, stake: bB.stakeBase, fronted: bB.frontedBase, returned: bB.returnedBase }, app: { costBase: bB.stakeBase - bB.returnedBase, markBase: mB.markBase, filledRaw: mB.filledRaw, ...bAppB }, chain: bHandB, oldRule: { cost: bB.stakeBase, pnl: bAppB.valueBase - bB.stakeBase } });
out("B-boost-match", { costIn: bB.stakeBase - bB.returnedBase === bHandB.costIn, mark: mB.markBase === bHandB.markRaw, pnl: bAppB.pnlBase === bHandB.pnl, whole: bAppB.fillablePct === 100 });
await pause("reduced");

// The Boost's last close (whole now), then its round in the one account history: returned − stake.
const last = await closeBoost("boost-close");
const done = await getLeveragePosition(positionId);
const d = done.ok ? done.value : null;
let round: { pnlBase: bigint; source?: string } | undefined;
for (let i = 0; i < 10 && !round; i++) {
  const h = await listAccountHistory(trader.address);
  round = h.ok ? h.value.rounds.find((r) => r.source === "boost" && r.marketId.toLowerCase() === marketId.toLowerCase()) : undefined;
  if (!round) await sleep(3_000);
}
out("boost-round", { status: d?.status, stake: d?.stakeBase, returned: d?.returnedBase, lastReturned: last.returned, appRoundPnl: round?.pnlBase, chainPnl: d ? d.returnedBase - d.stakeBase : null, match: d ? round?.pnlBase === d.returnedBase - d.stakeBase : false });

// The wallet's Close on the thin book (the terminal's: an exit read for the whole holding, then sell what it fills).
const exitC = await provider.freshExitQuote({ marketId: marketId as MarketId, decimals: 6 }, "up", p.balanceUpRaw);
if (!exitC.ok || !exitC.value) throw new Error("no exit for the wallet's Close");
out("wallet-exit", { closePays: exitC.value.proceedsBase, sells: exitC.value.contractsRaw, partial: exitC.value.partial });
const sellR = send([cashOutCall(venue.engine, { marketId, side: "up", ownLimitTicks: exitC.value.limitPriceTicks, lots: exitC.value.contractsRaw / lotBase, expireTsSec: w.market.lockAtSec, clientId: 2n })], "wallet close");
const sale = decodeEngineEvents(venue.engine, sellR.logs as never).executed[0]!;
const fills = parseEventLogs({ abi: eventsEngineAbi, eventName: "Fill", logs: sellR.logs as never }).filter((f) => f.args.taker.toLowerCase() === trader.address.toLowerCase());
// The ledger's average cost, fill by fill: each sale takes its share of what is still open (`soldShare`).
let openCost = cost;
let held = p.balanceUpRaw;
let soldCost = 0n;
for (const f of fills) {
  const s = f.args.lots * lotBase;
  const take = s >= held ? openCost : (openCost * s) / held;
  openCost -= take;
  held -= s;
  soldCost += take;
}
const realized = sale.result.cashReceived - soldCost;
out("wallet-close", { tx: sellR.transactionHash, filledLots: sale.result.filledLots, cashReceived: sale.result.cashReceived, fills: fills.map((f) => `${f.args.lots}@${f.args.priceTicks}`), chain: { heldRaw: held, openCost, realized } });
for (let i = 0; i < 40; i++) {
  row = await provider.listOpenPositions(trader.address);
  const q = rowOf();
  if (q && !q.costStale && q.balanceUpRaw === held && q.costUpBase === openCost) break;
  await sleep(3_000);
}
const after = rowOf();
out("wallet-close-match", { heldRaw: after?.balanceUpRaw, openCost: after?.costUpBase, realized: after?.realizedPnlBase, match: { held: after?.balanceUpRaw === held, openCost: after?.costUpBase === openCost, realized: after?.realizedPnlBase === realized } });

// The maker's leftovers off the book.
const cleanup = ok(castBatch([{ to: venue.engine, data: encodeFunctionData({ abi: eventsEngineAbi, functionName: "cancelAll", args: [marketId as Hex, 16, true] }) }], { signer: { walletFile: maker.file } }), "maker cancel");
out("cleanup", { tx: cleanup.transactionHash });
process.exit(0);
