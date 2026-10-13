/**
 * Arcade scores over Postgres (`arcade_scores`, D-226) — ported from Owarine 90a91d71:packages/db/src/arcade.ts.
 *
 * A row is a run the server replayed. It is never updated: a wallet's best is the greatest of its rows, a board is one
 * row per wallet, and a rank is one more than the wallets with a greater best. Rows are keyed by the engine build,
 * because a score from another build is not comparable. Wallets are lowercased at the write and only there.
 */
import type { Sql } from "./index";

export type ArcadeGameId = "line-rider" | "candle-hop";

export interface ArcadeScoreInput {
  game: ArcadeGameId;
  wallet: string;
  score: number;
  engineVersion: number;
  durationMs: number;
  seed: string;
  traceHash: string;
  calm: boolean;
}

export interface ArcadeBoardRow {
  wallet: string;
  score: number;
  calm: boolean;
  /** ISO 8601, when the best was set. */
  at: string;
}

/** One replayed run, as the hall's marquee and a player's history read it (R4-9, D-227). */
export interface ArcadeRunRow {
  game: ArcadeGameId;
  wallet: string;
  score: number;
  engineVersion: number;
  durationMs: number;
  seed: string | null;
  calm: boolean;
  /** ISO 8601. */
  at: string;
}

export interface ArcadeStore {
  record(input: ArcadeScoreInput): Promise<void>;
  /** Each wallet's best on this build, greatest first, the earlier of equals ahead. */
  board(game: ArcadeGameId, engineVersion: number, limit: number): Promise<ArcadeBoardRow[]>;
  best(wallet: string, game: ArcadeGameId, engineVersion: number): Promise<number | null>;
  /** One more than the number of wallets whose best beats `score`; equal bests share a rank. */
  rank(game: ArcadeGameId, engineVersion: number, score: number): Promise<number>;
  /** The newest replayed runs on any game, newest first — the hall's marquee. */
  recent(limit: number): Promise<ArcadeRunRow[]>;
  /** One wallet's runs, newest first — its history. */
  byWallet(wallet: string, limit: number): Promise<ArcadeRunRow[]>;
}

type RunDb = { game: ArcadeGameId; wallet: string; score: number; engine_version: number; duration_ms: number; seed: string | null; calm: boolean; created_at: Date };
const runRow = (r: RunDb): ArcadeRunRow => ({ game: r.game, wallet: r.wallet, score: r.score, engineVersion: r.engine_version, durationMs: r.duration_ms, seed: r.seed, calm: r.calm, at: r.created_at.toISOString() });

export function createPgArcadeStore(sql: Sql): ArcadeStore {
  return {
    async record(input) {
      await sql`
        insert into arcade_scores (game, wallet, score, engine_version, duration_ms, checked, seed, trace_hash, calm)
        values (${input.game}, ${input.wallet.toLowerCase()}, ${input.score}, ${input.engineVersion}, ${input.durationMs},
                'replayed', ${input.seed}, ${input.traceHash}, ${input.calm})`;
    },
    async board(game, engineVersion, limit) {
      const rows = await sql<{ wallet: string; score: number; calm: boolean; created_at: Date }[]>`
        select wallet, score, calm, created_at from (
          select distinct on (wallet) wallet, score, calm, created_at
          from arcade_scores
          where game = ${game} and engine_version = ${engineVersion}
          order by wallet, score desc, created_at asc
        ) best
        order by score desc, created_at asc
        limit ${limit}`;
      return rows.map((row) => ({ wallet: row.wallet, score: row.score, calm: row.calm, at: row.created_at.toISOString() }));
    },
    async best(wallet, game, engineVersion) {
      const rows = await sql<{ best: number | null }[]>`
        select max(score) as best from arcade_scores
        where game = ${game} and engine_version = ${engineVersion} and wallet = ${wallet.toLowerCase()}`;
      const best = rows[0]?.best;
      return best === null || best === undefined ? null : Number(best);
    },
    async rank(game, engineVersion, score) {
      const rows = await sql<{ n: string }[]>`
        select count(*)::text as n from (
          select wallet, max(score) as best from arcade_scores
          where game = ${game} and engine_version = ${engineVersion}
          group by wallet
        ) bests
        where bests.best > ${score}`;
      return Number(rows[0]?.n ?? 0) + 1;
    },
    async recent(limit) {
      const rows = await sql<RunDb[]>`
        select game, wallet, score, engine_version, duration_ms, seed, calm, created_at from arcade_scores
        order by created_at desc limit ${limit}`;
      return rows.map(runRow);
    },
    async byWallet(wallet, limit) {
      const rows = await sql<RunDb[]>`
        select game, wallet, score, engine_version, duration_ms, seed, calm, created_at from arcade_scores
        where wallet = ${wallet.toLowerCase()} order by created_at desc limit ${limit}`;
      return rows.map(runRow);
    },
  };
}
