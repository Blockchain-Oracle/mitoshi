/**
 * The duel's queue, matches and sealed decks over Postgres (`duel_queue`, `duel_matches`, `duel_decks`; migrations/
 * games/0001 and 0004) — R4-9 (D-227), on Masayume 68f7a09's tables (packages/db/src/schema-games.ts, decks.ts) with the
 * matchmaker's in-memory pending list (services/ops/src/actors/matchmaker/pending.ts) as a row per wallet.
 *
 * Pairing is one atomic claim: the oldest other wallet waiting at the tier inside the pairing window is marked taken
 * (`FOR UPDATE SKIP LOCKED`), so two arrivals never take the same opponent. The claim is released if no deck can be
 * dealt. A match row records what was committed; the chain (the arena's `matchOf`) stays the authority on its status.
 * Wallets and hex are lowercased at the write and only there. Money is decimal strings in base units.
 */
import type { Sql } from "./index";

export type DuelTierId = "free" | "t1" | "t5" | "t10";

export interface DuelQueueRow {
  wallet: string;
  tier: DuelTierId;
  clientSeed: string;
  matchId: string | null;
  queuedAt: string;
}

export interface DuelMatchRow {
  matchId: string;
  chainId: number;
  arena: string;
  tier: DuelTierId;
  creator: string;
  challenger: string | null;
  status: string;
  deckHash: string;
  deckSize: number;
  policyVersion: number;
  potPerPlayer: string;
  /** The dealt deck as committed (market ids and their facts), so a lobby renders before the reveal. */
  deck: unknown;
  /** The sealed reveal material (server seed, both client seeds, the cards). */
  sealed: string | null;
  revealedAt: string | null;
  createdAt: string;
}

export interface NewDuelMatch {
  matchId: string;
  chainId: number;
  arena: string;
  tier: DuelTierId;
  creator: string;
  challenger: string;
  deckHash: string;
  deckSize: number;
  policyVersion: number;
  potPerPlayer: string;
  lane: "5m" | "15m" | "1h" | "mixed";
  deck: unknown;
  sealed: string;
}

export interface DuelStore {
  /** Joins (or re-joins) the queue at a tier with a fresh client seed; a wallet being paired right now keeps that claim. */
  enqueue(wallet: string, tier: DuelTierId, clientSeed: string): Promise<DuelQueueRow>;
  queueOf(wallet: string): Promise<DuelQueueRow | null>;
  /** Claims the oldest other wallet waiting at the tier inside `windowSec` (the caller leaves the line while it pairs); null when nobody is. */
  claimOpponent(wallet: string, tier: DuelTierId, windowSec: number): Promise<DuelQueueRow | null>;
  /** Puts a claimed wallet back in line (no deck could be dealt) — the opponent and the caller alike. */
  release(wallet: string): Promise<void>;
  /** Records the committed match and its sealed deck, and marks both queue rows paired, in one transaction. */
  recordMatch(m: NewDuelMatch): Promise<void>;
  leave(wallet: string): Promise<void>;
  match(matchId: string): Promise<DuelMatchRow | null>;
  /** The chain's status, copied for history pages; the arena stays the authority. */
  setStatus(matchId: string, status: string, extra?: { winner?: string | null; creatorPnl?: string; challengerPnl?: string; cards?: readonly string[] }): Promise<void>;
  markRevealed(matchId: string): Promise<void>;
  matchesOf(wallet: string, limit: number): Promise<DuelMatchRow[]>;
  /** Match ids still undecided on the record, created inside `withinSec` — the settler's worklist. */
  live(withinSec: number, limit: number): Promise<string[]>;
  /** Who is waiting now, per tier, inside the pairing window — the hall's presence line. */
  waiting(windowSec: number): Promise<Record<string, number>>;
  /** Every decided duel (finalized or refunded), oldest first — the ladder's and the badges' input. */
  finished(limit: number): Promise<DuelFinishedRow[]>;
}

export interface DuelFinishedRow {
  matchId: string;
  tier: DuelTierId;
  creator: string;
  challenger: string;
  status: "finalized" | "refunded";
  winner: string | null;
  createdAt: string;
}

type QueueDb = { wallet: string; tier: DuelTierId; client_seed: string; match_id: string | null; queued_at: Date };
type MatchDb = {
  match_id: string; chain_id: number; arena: string; tier: DuelTierId; creator: string; challenger: string | null; status: string; deck_hash: string; deck_size: number;
  policy_version: number; pot_per_player: string; deck: unknown; sealed: string | null; revealed_at: Date | null; created_at: Date;
};

const queueRow = (r: QueueDb): DuelQueueRow => ({ wallet: r.wallet, tier: r.tier, clientSeed: r.client_seed, matchId: r.match_id, queuedAt: r.queued_at.toISOString() });
const matchRow = (r: MatchDb): DuelMatchRow => ({
  matchId: r.match_id, chainId: r.chain_id, arena: r.arena, tier: r.tier, creator: r.creator, challenger: r.challenger, status: r.status, deckHash: r.deck_hash, deckSize: r.deck_size,
  policyVersion: r.policy_version, potPerPlayer: r.pot_per_player, deck: r.deck, sealed: r.sealed, revealedAt: r.revealed_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(),
});

/** The claim marker a taken-but-not-yet-recorded opponent carries, so no other arrival can take it meanwhile. */
const claimOf = (by: string) => `claim:${by}`;

export function createPgDuelStore(sql: Sql): DuelStore {
  return {
    async enqueue(wallet, tier, clientSeed) {
      const w = wallet.toLowerCase();
      const rows = await sql<QueueDb[]>`
        insert into duel_queue (wallet, tier, client_seed, match_id, queued_at) values (${w}, ${tier}, ${clientSeed.toLowerCase()}, null, now())
        on conflict (wallet) do update set tier = excluded.tier, client_seed = excluded.client_seed, match_id = null, queued_at = now()
          where duel_queue.match_id is null or duel_queue.match_id not like 'claim:%' or duel_queue.queued_at < now() - interval '120 seconds'
        returning *`;
      // A wallet another arrival is pairing with right now keeps that claim (a claim older than two minutes is a
      // pairing that died, and gives way).
      if (rows[0]) return queueRow(rows[0]);
      const held = await sql<QueueDb[]>`select * from duel_queue where wallet = ${w}`;
      return queueRow(held[0]!);
    },
    async queueOf(wallet) {
      const rows = await sql<QueueDb[]>`select * from duel_queue where wallet = ${wallet.toLowerCase()}`;
      return rows[0] ? queueRow(rows[0]) : null;
    },
    async claimOpponent(wallet, tier, windowSec) {
      const w = wallet.toLowerCase();
      return sql.begin(async (tx) => {
        // The caller takes itself out of line first, so nobody pairs with a wallet that is busy pairing.
        const me = await tx<QueueDb[]>`update duel_queue set match_id = ${claimOf(w)} where wallet = ${w} and match_id is null returning wallet`;
        if (me.length === 0) return null;
        const rows = await tx<QueueDb[]>`
          update duel_queue set match_id = ${claimOf(w)}
          where wallet = (
            select wallet from duel_queue
            where tier = ${tier} and wallet <> ${w} and match_id is null and queued_at > now() - make_interval(secs => ${windowSec})
            order by queued_at limit 1 for update skip locked
          )
          returning *`;
        if (rows.length === 0) {
          await tx`update duel_queue set match_id = null where wallet = ${w}`;
          return null;
        }
        return queueRow(rows[0]!);
      });
    },
    async release(wallet) {
      await sql`update duel_queue set match_id = null where wallet = ${wallet.toLowerCase()} and match_id like 'claim:%'`;
    },
    async recordMatch(m) {
      await sql.begin(async (tx) => {
        await tx`
          insert into duel_matches (match_id, chain_id, arena, mode, tier, creator, challenger, status, deck_hash, deck_size, policy_version, pot_per_player)
          values (${m.matchId.toLowerCase()}, ${m.chainId}, ${m.arena.toLowerCase()}, ${m.tier === "free" ? "free" : "ranked"}, ${m.tier}, ${m.creator.toLowerCase()},
                  ${m.challenger.toLowerCase()}, 'waiting', ${m.deckHash.toLowerCase()}, ${m.deckSize}, ${m.policyVersion}, ${m.potPerPlayer})`;
        await tx`
          insert into duel_decks (match_id, chain_id, arena, policy_version, lane, cards, sealed)
          values (${m.matchId.toLowerCase()}, ${m.chainId}, ${m.arena.toLowerCase()}, ${m.policyVersion}, ${m.lane}, ${tx.json(m.deck as never)}, ${m.sealed})`;
        await tx`update duel_queue set match_id = ${m.matchId.toLowerCase()} where wallet in (${m.creator.toLowerCase()}, ${m.challenger.toLowerCase()})`;
      });
    },
    async leave(wallet) {
      await sql`delete from duel_queue where wallet = ${wallet.toLowerCase()} and match_id is null`;
    },
    async match(matchId) {
      const rows = await sql<MatchDb[]>`
        select m.match_id, m.chain_id, m.arena, m.tier, m.creator, m.challenger, m.status, m.deck_hash, m.deck_size, m.policy_version, m.pot_per_player,
               d.cards as deck, d.sealed, d.revealed_at, m.created_at
        from duel_matches m left join duel_decks d on d.match_id = m.match_id
        where m.match_id = ${matchId.toLowerCase()}`;
      return rows[0] ? matchRow(rows[0]) : null;
    },
    async setStatus(matchId, status, extra = {}) {
      await sql`
        update duel_matches set status = ${status},
          winner = coalesce(${extra.winner?.toLowerCase() ?? null}::text, winner),
          creator_pnl = coalesce(${extra.creatorPnl ?? null}::text, creator_pnl),
          challenger_pnl = coalesce(${extra.challengerPnl ?? null}::text, challenger_pnl),
          cards = coalesce(${extra.cards ? sql.json(extra.cards as never) : null}::jsonb, cards),
          finalized_at = case when ${status}::text in ('finalized', 'refunded') and finalized_at is null then now() else finalized_at end
        where match_id = ${matchId.toLowerCase()}`;
    },
    async markRevealed(matchId) {
      await sql`update duel_decks set revealed_at = coalesce(revealed_at, now()) where match_id = ${matchId.toLowerCase()}`;
    },
    async live(withinSec, limit) {
      const rows = await sql<{ match_id: string }[]>`
        select match_id from duel_matches
        where status not in ('finalized', 'refunded') and created_at > now() - make_interval(secs => ${withinSec})
        order by created_at limit ${limit}`;
      return rows.map((r) => r.match_id);
    },
    async waiting(windowSec) {
      const rows = await sql<{ tier: string; n: string }[]>`
        select tier, count(*)::text as n from duel_queue where match_id is null and queued_at > now() - make_interval(secs => ${windowSec}) group by tier`;
      return Object.fromEntries(rows.map((r) => [r.tier, Number(r.n)]));
    },
    async finished(limit) {
      const rows = await sql<{ match_id: string; tier: DuelTierId; creator: string; challenger: string; status: "finalized" | "refunded"; winner: string | null; created_at: Date }[]>`
        select match_id, tier, creator, challenger, status, winner, created_at from duel_matches
        where status in ('finalized', 'refunded') and challenger is not null
        order by created_at asc limit ${limit}`;
      return rows.map((r) => ({ matchId: r.match_id, tier: r.tier, creator: r.creator, challenger: r.challenger, status: r.status, winner: r.winner, createdAt: r.created_at.toISOString() }));
    },
    async matchesOf(wallet, limit) {
      const w = wallet.toLowerCase();
      const rows = await sql<MatchDb[]>`
        select m.match_id, m.chain_id, m.arena, m.tier, m.creator, m.challenger, m.status, m.deck_hash, m.deck_size, m.policy_version, m.pot_per_player,
               d.cards as deck, d.sealed, d.revealed_at, m.created_at
        from duel_matches m left join duel_decks d on d.match_id = m.match_id
        where m.creator = ${w} or m.challenger = ${w}
        order by m.created_at desc limit ${limit}`;
      return rows.map(matchRow);
    },
  };
}
