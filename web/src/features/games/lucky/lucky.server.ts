import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { isOk, toMarketId, type Address, type Bytes32, type EventMarket, type Hex, type Quote, type Side } from "@cwf/core";
import {
  luckyBestStreak,
  luckyStreak,
  chooseLuckyWindow,
  eligibleLuckyWindows,
  LUCKY_ASSETS,
  LUCKY_MULTIPLIERS,
  LUCKY_POLICY_VERSION,
  luckyCandidatePreimage,
  luckyDrawMessage,
  mapLuckyDraw,
  type LuckyCandidate,
  type LuckyDrawInput,
} from "@cwf/core/games";
import { createPgLuckyStore, type LuckyDrawRow, type LuckyStore } from "@cwf/db";
import { createMarketsProvider } from "@cwf/markets";
import { keccak256 } from "viem";
import { ceremonyLimiter } from "@/server/auth";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { ensureServerReads } from "../server-reads";
import type { LuckyBoardWire, LuckyCommitWire, LuckyDealWire, LuckyHistoryWire, LuckyRowWire } from "./lucky-wire";

/**
 * The draw — server only (R4-9, D-227). Ported from Masayume 68f7a09 web/src/features/games/lucky/{lucky.server.ts,
 * lucky-digest.server.ts} (Owarine 90a91d71 carries the same), on Mitoshi's store and read port.
 *
 * The order is the whole mechanism: commit a server seed before the reels move; take the browser's seed after it has
 * seen the commitment; derive the draw from both with an HMAC nobody could have steered alone; then scan the venue for
 * a live Window of the drawn asset, quote each on the drawn side at the stake on the real book, and deal the one whose
 * price sits closest to the drawn reach. Every fact goes back before anything is signed; the browser places on its own
 * live quote. The chain reads are packages/markets' (`createMarketsProvider`), never this file's.
 */
const PER_ADDRESS_PER_HOUR = 120;
const PER_IP_PER_HOUR = 240;
/** $1 in pathUSD base units (6 decimals): the floor a draw may stake; $25 the cap (the four chips). */
const MIN_STAKE_BASE = 1_000_000n;
const MAX_STAKE_BASE = 25_000_000n;

let store: LuckyStore | null = null;
function luckyStore(): LuckyStore | null {
  if (!serverEnv().databaseUrl) return null;
  store ??= createPgLuckyStore(db());
  return store;
}

const hexBytes = (hex: Hex): Buffer => Buffer.from(hex.slice(2), "hex");
const freshSeed = (): Bytes32 => `0x${randomBytes(32).toString("hex")}`;

/** HMAC-SHA256, keyed by the committed server seed, over core's canonical message (the browser can recompute it). */
export function luckyDigest(serverSeed: Bytes32, input: LuckyDrawInput): Uint8Array {
  return new Uint8Array(createHmac("sha256", hexBytes(serverSeed)).update(hexBytes(luckyDrawMessage(input))).digest());
}

export type Outcome<T> = { ok: true; wire: T } | { ok: false; status: number; error: string };

export async function commitDraw(input: { wallet: Address; stakeBase: bigint; ip: string }): Promise<Outcome<LuckyCommitWire>> {
  const draws = luckyStore();
  if (!draws) return { ok: false, status: 503, error: "This deployment keeps no draws." };
  if (input.stakeBase < MIN_STAKE_BASE || input.stakeBase > MAX_STAKE_BASE) return { ok: false, status: 400, error: "stake must be $1 to $25" };
  const limiter = ceremonyLimiter();
  if (!(await limiter.allow(`lucky:ip:${input.ip}`, PER_IP_PER_HOUR, 3_600))) return { ok: false, status: 429, error: "too many spins from here this hour" };
  if (!(await limiter.allow(`lucky:addr:${input.wallet.toLowerCase()}`, PER_ADDRESS_PER_HOUR, 3_600))) return { ok: false, status: 429, error: "too many spins this hour" };
  const serverSeed = freshSeed();
  const created = await draws.create({ drawId: freshSeed(), wallet: input.wallet, policyVersion: LUCKY_POLICY_VERSION, stakeBase: input.stakeBase.toString(), commitment: keccak256(serverSeed), serverSeed });
  return { ok: true, wire: { drawId: created.drawId as Bytes32, commitment: created.commitment as Bytes32, nonce: created.nonce, policyVersion: created.policyVersion, stakeBase: created.stakeBase } };
}

interface Scanned {
  candidateHash: Bytes32;
  candidateCount: number;
  quotedCount: number;
  chosen: { market: EventMarket; quote: Quote } | null;
}

async function scan(asset: string, side: Side, multiplier: number, stakeBase: bigint): Promise<Scanned | null> {
  const port = createMarketsProvider();
  const lanes = await port.listLiveLanes();
  if (!isOk(lanes)) return null;
  const nowSec = Math.floor(port.nowMs() / 1_000);
  const markets = lanes.value.lanes.flatMap((lane) => lane.markets);
  const byId = new Map(markets.map((m) => [m.marketId, m]));
  const candidates: LuckyCandidate[] = markets.map((m) => ({ marketId: m.marketId, asset: m.asset, intervalSec: m.intervalSec, expirySec: m.expirySec, trading: m.tradingStartSec <= nowSec && nowSec < m.lockAtSec }));
  const eligible = eligibleLuckyWindows(candidates, asset, nowSec);
  const candidateHash = keccak256(luckyCandidatePreimage(eligible.map((c) => c.marketId), LUCKY_POLICY_VERSION));
  const quoted = await Promise.all(
    eligible.map(async (c) => {
      const market = byId.get(c.marketId)!;
      const q = await port.freshQuoteStake({ marketId: market.marketId, decimals: market.decimals, intervalSec: market.intervalSec }, side, stakeBase);
      return { market, answered: isOk(q), quote: isOk(q) ? q.value : null };
    }),
  );
  const fillable = quoted.filter((q): q is typeof q & { quote: Quote } => q.quote !== null).map((q) => ({ marketId: q.market.marketId, expirySec: q.market.expirySec, avgPriceBps: q.quote.avgPriceBps, partial: q.quote.partial, q }));
  const best = chooseLuckyWindow(fillable, multiplier);
  return { candidateHash, candidateCount: eligible.length, quotedCount: quoted.filter((q) => q.answered).length, chosen: best ? { market: best.q.market, quote: best.q.quote } : null };
}

function refusalOf(s: Scanned | null): string | null {
  if (s === null) return "the venue could not be read";
  if (s.chosen) return null;
  return s.candidateCount > 0 && s.quotedCount === 0 ? "the venue could not be read" : "no Window of that asset can fill this stake right now";
}

function dealWire(row: LuckyDrawRow, extra: { candidateCount: number; quote: Quote | null }): LuckyDealWire {
  return {
    drawId: row.drawId as Bytes32,
    nonce: row.nonce,
    policyVersion: row.policyVersion,
    stakeBase: row.stakeBase,
    commitment: row.commitment as Bytes32,
    serverSeed: row.serverSeed as Bytes32,
    clientSeed: (row.clientSeed ?? "0x") as Bytes32,
    assets: LUCKY_ASSETS,
    multipliers: LUCKY_MULTIPLIERS,
    draw: { asset: row.asset ?? "", side: row.side ?? "up", multiplier: row.multiplier ?? 0 },
    candidateHash: (row.candidateHash ?? "0x") as Bytes32,
    candidateCount: extra.candidateCount,
    marketId: row.marketId,
    dealtAvgPriceBps: extra.quote?.avgPriceBps ?? row.quoteAvgPriceBps,
    result: row.result === "refused" ? "refused" : "drawn",
    refusal: row.refusal,
  };
}

export async function revealDraw(input: { drawId: string; clientSeed: Bytes32; wallet: Address }): Promise<Outcome<LuckyDealWire>> {
  const draws = luckyStore();
  if (!draws) return { ok: false, status: 503, error: "This deployment keeps no draws." };
  const row = await draws.get(input.drawId);
  if (!row || row.wallet !== input.wallet.toLowerCase()) return { ok: false, status: 404, error: "no draw by that id" };
  if (row.clientSeed !== null) {
    if (row.clientSeed !== input.clientSeed.toLowerCase()) return { ok: false, status: 409, error: "that draw was already revealed with another seed" };
    return { ok: true, wire: dealWire(row, { candidateCount: 0, quote: null }) };
  }
  const digest = luckyDigest(row.serverSeed as Bytes32, { clientSeed: input.clientSeed, wallet: row.wallet as Address, nonce: row.nonce, policyVersion: row.policyVersion });
  const draw = mapLuckyDraw(digest, { assets: LUCKY_ASSETS, multipliers: LUCKY_MULTIPLIERS });
  ensureServerReads();
  const scanned = await scan(draw.asset, draw.side, draw.multiplier, BigInt(row.stakeBase)).catch(() => null);
  const chosen = scanned?.chosen ?? null;
  const refusal = refusalOf(scanned);
  const deal = { clientSeed: input.clientSeed, asset: draw.asset, side: draw.side, multiplier: draw.multiplier, candidateHash: scanned?.candidateHash ?? "0x", marketId: chosen?.market.marketId ?? null, quoteAvgPriceBps: chosen?.quote.avgPriceBps ?? null, quoteContractsRaw: chosen ? chosen.quote.contractsRaw.toString() : null, result: chosen ? ("drawn" as const) : ("refused" as const), refusal };
  await draws.reveal(row.drawId, deal);
  const revealed: LuckyDrawRow = { ...row, ...deal, clientSeed: input.clientSeed.toLowerCase(), candidateHash: deal.candidateHash };
  return { ok: true, wire: dealWire(revealed, { candidateCount: scanned?.candidateCount ?? 0, quote: chosen?.quote ?? null }) };
}

/** What the browser's ticket lane came back with; the row records it once. Settlement is the chain's (the Window's). */
export async function recordPlaced(input: { drawId: string; wallet: Address; status: "confirmed" | "refused" | "unknown"; txHash: Hex | null; costBase: string | null; quantityRaw: string | null; refusal: string | null }): Promise<Outcome<{ recorded: boolean }>> {
  const draws = luckyStore();
  if (!draws) return { ok: false, status: 503, error: "This deployment keeps no draws." };
  const recorded = await draws.placed(input.drawId, input.wallet, {
    result: input.status === "confirmed" ? "placed" : input.status === "refused" ? "refused" : "unknown",
    txHash: input.txHash,
    costBase: input.costBase,
    quantityRaw: input.quantityRaw,
    refusal: input.refusal,
  });
  return { ok: true, wire: { recorded } };
}

const rowWire = (r: LuckyDrawRow): LuckyRowWire => ({ drawId: r.drawId as Bytes32, nonce: r.nonce, asset: r.asset, side: r.side, multiplier: r.multiplier, marketId: r.marketId ? toMarketId(r.marketId) : null, txHash: (r.txHash ?? null) as Hex | null, stakeBase: r.stakeBase, costBase: r.costBase, result: r.result, refusal: r.refusal, createdAt: r.createdAt });

/**
 * Open rows re-read against the chain on the history read (Masayume 68f7a09 `reconcileDraws`, on Mitoshi's account
 * history): the wallet's round on the dealt Window says what happened — sold on the book before expiry is a cash-out,
 * otherwise the settlement's win, loss or void. A row the chain has not decided stays what it was; nothing is guessed.
 */
async function reconcile(draws: LuckyStore, wallet: Address, rows: LuckyDrawRow[]): Promise<boolean> {
  const open = rows.filter((r) => r.marketId && (r.result === "placed" || r.result === "pending" || r.result === "unknown"));
  if (open.length === 0) return false;
  ensureServerReads();
  const history = await createMarketsProvider().listWalletHistory(wallet);
  if (!isOk(history)) return false;
  const byMarket = new Map(history.value.rounds.map((r) => [r.marketId.toLowerCase(), r.outcome]));
  let moved = false;
  for (const row of open) {
    const outcome = byMarket.get(row.marketId!.toLowerCase());
    if (!outcome) continue;
    await draws.settle(row.drawId, outcome === "closed" ? "cashed-out" : outcome === "win" ? "won" : outcome === "loss" ? "lost" : "void");
    moved = true;
  }
  return moved;
}

export async function readHistory(wallet: Address): Promise<LuckyHistoryWire> {
  const draws = luckyStore();
  if (!draws) return { configured: false, rows: [], streak: 0, best: 0 };
  let rows = await draws.history(wallet, 50);
  if (await reconcile(draws, wallet, rows).catch(() => false)) rows = await draws.history(wallet, 50);
  const results = rows.map((r) => ({ result: r.result }));
  return { configured: true, rows: rows.map(rowWire), streak: luckyStreak(results), best: luckyBestStreak([...results].reverse()) };
}

/** The ladder of current streaks, best as the tiebreak, over settled draws only (core's rule). */
export async function readLuckyBoard(): Promise<LuckyBoardWire> {
  const draws = luckyStore();
  if (!draws) return { configured: false, rows: [] };
  const byWallet = new Map<string, { result: LuckyDrawRow["result"] }[]>();
  for (const r of await draws.verified(2_000)) byWallet.set(r.wallet, [...(byWallet.get(r.wallet) ?? []), { result: r.result }]);
  const rows = [...byWallet.entries()]
    .map(([w, list]) => ({ wallet: w, streak: luckyStreak(list), best: luckyBestStreak([...list].reverse()), draws: list.length }))
    .filter((r) => r.best > 0)
    .sort((a, b) => b.streak - a.streak || b.best - a.best || b.draws - a.draws || a.wallet.localeCompare(b.wallet))
    .slice(0, 50);
  return { configured: true, rows };
}
