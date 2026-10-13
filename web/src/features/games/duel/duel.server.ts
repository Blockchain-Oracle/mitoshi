import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isOk, type Address, type Bytes32, type MarketId } from "@cwf/core";
import { applyResult, arenaWinnerOf, DECK_MAX, deckCommitmentPreimage, DUEL_POLICY_VERSION, INTERVAL_15M_SEC, INTERVAL_1H_SEC, NEW_RATING, type RatingRecord, nextDealableSec, selectDeck, STAKE_TIERS, toBaseUnits, type DeckCandidate, type DeckCard, type DeckPolicy, type StakeTierId } from "@cwf/core/games";
import { createPgDuelStore, type DuelMatchRow, type DuelStore } from "@cwf/db";
import { createMarketsProvider, tempoChain } from "@cwf/markets";
import { arenaOf, getArenaCredit, getArenaMatch, getArenaState } from "@cwf/markets/arena";
import { keccak256 } from "viem";
import { webEnv } from "@/lib/env";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { ensureServerReads } from "../server-reads";
import type { DuelMatchWire, DuelPairedWire, DuelQueueWire } from "./duel-wire";

/**
 * The duel's matchmaker and deckmaster — server only (R4-9, D-227). Ported from Masayume 68f7a09
 * services/ops/src/actors/matchmaker/{index,deckmaster,seal}.ts onto the web server: two wallets waiting at one tier are
 * paired in one atomic claim; the deck is dealt from the venue's live 15-minute and 1-hour Windows that fill a per-card
 * stake on both sides (core `selectDeck`, the owner's never-5m policy, at the arena's own headroom); a fresh server seed
 * and both client seeds — each committed before either player
 * saw a deck — fix it under the arena's commitment (core `deckCommitmentPreimage`, the arena's `ArenaCommitment` word for
 * word). The reveal material is sealed at rest (AES-256-GCM, a key derived from a server secret, never in the database)
 * and handed out only once the chain shows both pots in — `revealDeck` is permissionless, so either player's browser
 * opens the deck. The chain reads are packages/markets' (`createMarketsProvider`, `@cwf/markets/arena`).
 */
const PAIR_WINDOW_SEC = 90;
const DECIMALS = 6;
/** A paired match the creator never opened is let go after this, so the pair can queue again. */
const STALE_PAIR_SEC = 120;
/** Join + reveal + card life at the deployed arena (30 + 30 + 120), plus the creator's entry latency. */
const DEAL_HEADROOM_SEC = 210;
/** Windows quoted at once while dealing (two reads each). */
const QUOTE_BATCH = 4;

let store: DuelStore | null = null;
function duelStore(): DuelStore | null {
  if (!serverEnv().databaseUrl) return null;
  store ??= createPgDuelStore(db());
  return store;
}

/** The sealing key: derived from a server secret the deployment already holds; null when it holds none. */
function deckKey(): Buffer | null {
  const secret = serverEnv().streamTicketSecret ?? serverEnv().socialSecret;
  return secret ? createHash("sha256").update(`mitoshi.duel.deck:${secret}`).digest() : null;
}

interface RevealMaterial {
  serverSeed: Bytes32;
  clientSeeds: Bytes32[];
  cards: MarketId[];
}

function seal(material: RevealMaterial, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(material), "utf8"), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

function open(sealed: string, key: Buffer): RevealMaterial {
  const raw = Buffer.from(sealed, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8")) as RevealMaterial;
}

const freshSeed = (): Bytes32 => `0x${randomBytes(32).toString("hex")}`;

export type Outcome<T> = { ok: true; wire: T } | { ok: false; status: number; error: string };

const tierIndex = (id: StakeTierId) => STAKE_TIERS.findIndex((t) => t.id === id);

function pairedWire(m: DuelMatchRow, wallet: string): DuelPairedWire {
  const tier = STAKE_TIERS[tierIndex(m.tier)]!;
  return {
    status: "paired",
    matchId: m.matchId as Bytes32,
    role: m.creator === wallet.toLowerCase() ? "creator" : "challenger",
    creator: m.creator as Address,
    challenger: (m.challenger ?? "") as Address,
    tier: m.tier,
    tierIndex: tierIndex(m.tier),
    potBase: m.potPerPlayer,
    perCardCapBase: toBaseUnits(tier.perCardCapUnits, DECIMALS).toString(),
    deckHash: m.deckHash as Bytes32,
    deckSize: m.deckSize,
    policyVersion: m.policyVersion,
  };
}

/**
 * The deck's candidates and the schedule: every live 15-minute and 1-hour Window (the owner's standing deck policy —
 * never 5m until live timing proves a whole duel fits inside one; core `selectDeck` without `cadences`), soonest lock
 * first, quoted on both sides at the per-card stake until a full deck's worth fill; and every live Window of those
 * cadences, which `nextDealableSec` projects the next deck from.
 */
async function candidates(capBase: bigint): Promise<{ list: DeckCandidate[]; schedule: DeckCandidate[]; policy: DeckPolicy; nowSec: number } | null> {
  const port = createMarketsProvider();
  const lanes = await port.listLiveLanes();
  if (!isOk(lanes)) return null;
  const nowSec = Math.floor(port.nowMs() / 1_000);
  const live = lanes.value.lanes
    .flatMap((l) => l.markets)
    .filter((m) => (m.intervalSec === INTERVAL_15M_SEC || m.intervalSec === INTERVAL_1H_SEC) && m.tradingStartSec <= nowSec && nowSec < m.lockAtSec)
    .sort((a, b) => a.lockAtSec - b.lockAtSec || a.marketId.localeCompare(b.marketId));
  // The card's life is counted to its lock: the arena checks `lockAt` at the reveal and at every pick.
  const asCandidate = (m: (typeof live)[number], trading: boolean): DeckCandidate => ({ marketId: m.marketId, asset: m.asset, intervalSec: m.intervalSec, expirySec: m.lockAtSec, trading, spreadRaw: 0n, depthRaw: 0n });
  const list: DeckCandidate[] = [];
  let fillable = 0;
  // Soonest first, a few at a time, until a full deck's worth fills: the venue is read for what can be dealt, not all.
  const queue = live.filter((m) => m.lockAtSec - nowSec >= DEAL_HEADROOM_SEC);
  for (let i = 0; i < queue.length && fillable < DECK_MAX; i += QUOTE_BATCH) {
    const batch = await Promise.all(
      queue.slice(i, i + QUOTE_BATCH).map(async (m) => {
        const ref = { marketId: m.marketId, decimals: m.decimals, intervalSec: m.intervalSec };
        const [up, down] = await Promise.all([port.freshQuoteStake(ref, "up", capBase), port.freshQuoteStake(ref, "down", capBase)]);
        return asCandidate(m, isOk(up) && isOk(down) && up.value !== null && down.value !== null && !up.value.partial && !down.value.partial);
      }),
    );
    list.push(...batch);
    fillable += batch.filter((c) => c.trading).length;
  }
  const policy: DeckPolicy = { supportedAssets: [...new Set(live.map((m) => m.asset))], maxSpreadRaw: 0n, minDepthRaw: 0n, horizonSec: INTERVAL_1H_SEC, minHeadroomSec: DEAL_HEADROOM_SEC };
  return { list, schedule: live.map((m) => asCandidate(m, true)), policy, nowSec };
}

/** The app's Tempo chain (Moderato on testnet). */
const chainId = (): number => tempoChain(webEnv.markets.network).id;

/** Joins the queue at a tier, and pairs with whoever waits longest there when a deck can be dealt now. */
export async function enterQueue(input: { wallet: Address; tier: StakeTierId; clientSeed: Bytes32 }): Promise<Outcome<DuelQueueWire>> {
  const duels = duelStore();
  const key = deckKey();
  if (!duels || !key) return { ok: false, status: 503, error: "This deployment keeps no duels." };
  const arena = arenaOf(chainId());
  if (!arena) return { ok: false, status: 503, error: "The arena is not deployed on this network." };
  const tier = STAKE_TIERS[tierIndex(input.tier)];
  if (!tier) return { ok: false, status: 400, error: "unknown tier" };
  const current = await readQueue(input.wallet);
  if (current.status === "paired") return { ok: true, wire: current };

  const mine = await duels.enqueue(input.wallet, input.tier, input.clientSeed);
  const opponent = await duels.claimOpponent(input.wallet, input.tier, PAIR_WINDOW_SEC);
  const waiting = (refusal: string | null, nextDealSec: number | null): Outcome<DuelQueueWire> => ({ ok: true, wire: { status: "waiting", tier: input.tier, queuedAt: mine.queuedAt, nextDealSec, refusal } });
  if (!opponent) return waiting(null, null);

  ensureServerReads();
  const capBase = toBaseUnits(tier.perCardCapUnits, DECIMALS);
  const dealt = await candidates(capBase).catch(() => null);
  const selection = dealt ? selectDeck(dealt.list, dealt.policy, dealt.nowSec) : null;
  if (!dealt || !selection || !selection.ok) {
    await duels.release(opponent.wallet);
    await duels.release(input.wallet);
    const next = dealt ? nextDealableSec(dealt.schedule, dealt.policy, dealt.nowSec) : null;
    return waiting(dealt ? "no deck right now" : "the venue could not be read", next);
  }

  const matchId = freshSeed();
  const serverSeed = freshSeed();
  // The caller is on the page and signs first; seeds go in seat order (creator, challenger).
  const clientSeeds = [input.clientSeed.toLowerCase() as Bytes32, opponent.clientSeed as Bytes32];
  const cards = selection.cards.map((c) => c.marketId);
  const deckHash = keccak256(deckCommitmentPreimage({ chainId: chainId(), arena: arena.gameArena, matchId, policyVersion: DUEL_POLICY_VERSION, serverSeed, clientSeeds, cards }));
  try {
    await duels.recordMatch({
      matchId,
      chainId: chainId(),
      arena: arena.gameArena,
      tier: input.tier,
      creator: input.wallet,
      challenger: opponent.wallet,
      deckHash,
      deckSize: cards.length,
      policyVersion: DUEL_POLICY_VERSION,
      potPerPlayer: toBaseUnits(tier.potUnits, DECIMALS).toString(),
      lane: selection.lane,
      deck: selection.cards,
      sealed: seal({ serverSeed, clientSeeds, cards }, key),
    });
  } catch {
    await duels.release(opponent.wallet);
    await duels.release(input.wallet);
    return { ok: false, status: 503, error: "the match could not be recorded" };
  }
  const row = await duels.match(matchId);
  return row ? { ok: true, wire: pairedWire(row, input.wallet) } : { ok: false, status: 503, error: "the match could not be read back" };
}

/** Where a wallet stands: idle, waiting, or paired into a match that is still live. */
export async function readQueue(wallet: Address): Promise<DuelQueueWire> {
  const duels = duelStore();
  if (!duels) return { status: "idle" };
  const q = await duels.queueOf(wallet);
  if (!q) return { status: "idle" };
  if (q.matchId && !q.matchId.startsWith("claim:")) {
    const m = await duels.match(q.matchId);
    const ageSec = m ? (Date.now() - Date.parse(m.createdAt)) / 1_000 : Infinity;
    if (m && (m.status !== "waiting" || ageSec < STALE_PAIR_SEC) && m.status !== "finalized" && m.status !== "refunded") return pairedWire(m, wallet);
    return { status: "idle" };
  }
  if (q.matchId?.startsWith("claim:")) return { status: "waiting", tier: q.tier, queuedAt: q.queuedAt, nextDealSec: null, refusal: null };
  const fresh = (Date.now() - Date.parse(q.queuedAt)) / 1_000 < PAIR_WINDOW_SEC;
  return fresh ? { status: "waiting", tier: q.tier, queuedAt: q.queuedAt, nextDealSec: null, refusal: null } : { status: "idle" };
}

export async function leaveQueue(wallet: Address): Promise<void> {
  await duelStore()?.leave(wallet);
}

const FINISHED = new Set(["finalized", "refunded"]);

/** One match: what was committed, what the chain says now, and — once both pots are in — the reveal material. */
export async function readMatch(input: { matchId: Bytes32; wallet: Address | null }): Promise<Outcome<DuelMatchWire>> {
  const duels = duelStore();
  if (!duels) return { ok: false, status: 503, error: "This deployment keeps no duels." };
  const row = await duels.match(input.matchId);
  if (!row) return { ok: false, status: 404, error: "no duel by that id" };
  ensureServerReads();
  const chain = await getArenaMatch(input.matchId);
  if (!isOk(chain)) return { ok: false, status: 503, error: "the arena could not be read" };
  const view = chain.value;
  const status = view ? view.match.status : "pending";
  // The record follows the chain for History and Rank. The winner is `finalize`'s own rule, re-derived from the state it
  // leaves: a seat that played every card against one that didn't took a forfeit; otherwise the greater P&L; a tie, none.
  if (view && view.match.status !== row.status) {
    await duels.setStatus(row.matchId, view.match.status, { winner: view.match.status === "finalized" ? arenaWinnerOf(view.match, view.creatorPnlBase, view.challengerPnlBase) : null, creatorPnl: view.creatorPnlBase.toString(), challengerPnl: view.challengerPnlBase.toString(), cards: view.cards.length ? view.cards : undefined });
  }
  const state = await getArenaState();
  const windows = isOk(state) && state.value ? state.value.params : null;
  const key = deckKey();
  const potsIn = view !== null && view.match.status !== "waiting";
  let reveal: DuelMatchWire["reveal"] = null;
  if (potsIn && key && row.sealed) {
    const material = open(row.sealed, key);
    reveal = { serverSeed: material.serverSeed, clientSeeds: material.clientSeeds, cards: material.cards };
    if (view && view.cards.length > 0) await duels.markRevealed(row.matchId);
  }
  const port = createMarketsProvider();
  const played = view ? view.match.pickedMask0 | view.match.pickedMask1 : 0;
  const deck = (row.deck as DeckCard[]) ?? [];
  const decided: number[] = [];
  if (view && !FINISHED.has(view.match.status)) {
    await Promise.all(
      deck.map(async (card) => {
        if (!((played >> card.index) & 1) || (view.match.settledMask >> card.index) & 1) return;
        const onchain = await port.getOnchain(card.marketId);
        if (isOk(onchain) && onchain.value.payouts !== null) decided.push(card.index);
      }),
    );
  }
  const credit = input.wallet ? await getArenaCredit(input.wallet) : null;
  const params = view ? view.match : null;
  return {
    ok: true,
    wire: {
      matchId: row.matchId as Bytes32,
      creator: row.creator as Address,
      challenger: (row.challenger ?? "") as Address,
      tier: row.tier,
      potBase: row.potPerPlayer,
      perCardCapBase: view ? view.match.perCardCapBase.toString() : toBaseUnits(STAKE_TIERS[tierIndex(row.tier)]!.perCardCapUnits, DECIMALS).toString(),
      status,
      deck,
      createdAtSec: params ? params.createdAtSec : Math.floor(Date.parse(row.createdAt) / 1_000),
      joinDeadlineSec: params && params.createdAtSec && windows ? params.createdAtSec + windows.joinWindowSec : null,
      revealDeadlineSec: params && params.joinedAtSec && windows ? params.joinedAtSec + windows.revealWindowSec : null,
      pickDeadlineSec: params && params.pickDeadlineSec ? params.pickDeadlineSec : null,
      picks: (view?.picks ?? []).map((p) => ({ cardIndex: p.cardIndex, seat: p.seat, pick: p.pick, quantity: p.quantity.toString(), costBase: p.costBase.toString(), payoutBase: p.payoutBase.toString(), settled: p.settled })),
      creatorPnlBase: (view?.creatorPnlBase ?? 0n).toString(),
      challengerPnlBase: (view?.challengerPnlBase ?? 0n).toString(),
      decided: decided.sort((a, b) => a - b),
      settledMask: view?.match.settledMask ?? 0,
      reveal,
      creditBase: credit && isOk(credit) ? credit.value.toString() : "0",
    },
  };
}

/** A wallet's duels, newest first, for History. */
export async function readDuelHistory(wallet: Address): Promise<{ configured: boolean; rows: { matchId: string; tier: string; status: string; opponent: string; createdAt: string }[] }> {
  const duels = duelStore();
  if (!duels) return { configured: false, rows: [] };
  const rows = await duels.matchesOf(wallet, 30);
  const w = wallet.toLowerCase();
  return { configured: true, rows: rows.map((m) => ({ matchId: m.matchId, tier: m.tier, status: m.status, opponent: (m.creator === w ? m.challenger : m.creator) ?? "", createdAt: m.createdAt })) };
}

export interface DuelStanding {
  wallet: string;
  rating: number;
  verifiedMatches: number;
  finished: number;
  won: number;
  stakedWon: number;
}

/**
 * The ladder (core `rating.ts`: one transparent Elo, 1000 to start, K 48 for the first ten verified matches, then 24),
 * replayed over every decided duel oldest first. A refund is finished but not verified (it moves no rating); a forfeit
 * is a real result. Recomputed on read from the record the arena's own state wrote — nothing here is stored twice.
 */
export async function duelStandings(opts: { everyone?: boolean } = {}): Promise<{ configured: boolean; rows: DuelStanding[] }> {
  const duels = duelStore();
  if (!duels) return { configured: false, rows: [] };
  const by = new Map<string, DuelStanding & { record: RatingRecord }>();
  const of = (w: string) => {
    let s = by.get(w);
    if (!s) by.set(w, (s = { wallet: w, rating: NEW_RATING.rating, verifiedMatches: 0, finished: 0, won: 0, stakedWon: 0, record: NEW_RATING }));
    return s;
  };
  for (const m of await duels.finished(5_000)) {
    const a = of(m.creator);
    const b = of(m.challenger);
    a.finished += 1;
    b.finished += 1;
    if (m.status !== "finalized") continue;
    const score = m.winner === null ? 0.5 : m.winner === m.creator ? 1 : 0;
    const next = applyResult(a.record, b.record, score);
    a.record = next.a;
    b.record = next.b;
    const winner = m.winner === m.creator ? a : m.winner === m.challenger ? b : null;
    if (winner) {
      winner.won += 1;
      if (m.tier !== "free") winner.stakedWon += 1;
    }
  }
  const rows = [...by.values()].map(({ record, ...s }) => ({ ...s, rating: record.rating, verifiedMatches: record.verifiedMatches }));
  return { configured: true, rows: rows.filter((r) => opts.everyone || r.verifiedMatches > 0).sort((x, y) => y.rating - x.rating || y.won - x.won || x.wallet.localeCompare(y.wallet)) };
}

/** Who is waiting at each pot right now (the queue's own rows inside the pairing window). */
export async function duelPresence(): Promise<{ configured: boolean; waiting: Record<string, number> }> {
  const duels = duelStore();
  if (!duels) return { configured: false, waiting: {} };
  return { configured: true, waiting: await duels.waiting(PAIR_WINDOW_SEC) };
}
