import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  envelopeCheck,
  FLAP_ENGINE_VERSION,
  isArcadeSeed,
  MAX_RUN_TICKS,
  replayArcade,
  RIDE_ENGINE_VERSION,
  seedFromBytes,
  ticksToMs,
  traceCanonical,
  type ArcadeGame,
} from "@cwf/core/games/arcade";
import { createPgArcadeStore, type ArcadeRunRow, type ArcadeStore } from "@cwf/db";
import { z } from "zod";
import { ceremonyLimiter } from "@/server/auth";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import type { BoardWire, ScoreAcceptedWire } from "./wire";

/**
 * Accepting an arcade score — server only. Ported from Owarine 90a91d71 `features/games/arcade/score.server.ts` (D-226);
 * the poster is the caller's session (passkey or social), not Owarine's room token.
 *
 * Cheapest refusal first: the shape, the store, the identity, the engine build, the envelope, then the replay, then
 * the rate limit, then the row. The replay is the check: the server runs the same engine over the same seed and inputs
 * and accepts only a score it reproduced to the tick. It cannot prove a browser wasn't scripted, and doesn't claim
 * to: the label is "server-checked · not on-chain".
 */
export const ENGINE_VERSION: Readonly<Record<ArcadeGame, number>> = { "line-rider": RIDE_ENGINE_VERSION, "candle-hop": FLAP_ENGINE_VERSION };

/** The board a title shows and the rank an over plate names come from the same ten rows. */
export const BOARD_LIMIT = 10;
/** Per hour, per wallet and per IP. A run is a minute; nobody plays two a second. */
const PER_ADDRESS_PER_HOUR = 120;
const PER_IP_PER_HOUR = 240;

export const scoreClaimSchema = z.object({
  game: z.enum(["line-rider", "candle-hop"]),
  seed: z.string().refine(isArcadeSeed, "not an arcade seed"),
  engineVersion: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  calm: z.boolean(),
  trace: z.array(z.number().int().nonnegative()).max(MAX_RUN_TICKS * 2),
});

export type ScoreClaim = z.infer<typeof scoreClaimSchema>;

export type ScoreVerdict = { ok: true; body: ScoreAcceptedWire } | { ok: false; status: number; error: string };

let store: ArcadeStore | null = null;
function arcadeStore(): ArcadeStore | null {
  if (!serverEnv().databaseUrl) return null;
  store ??= createPgArcadeStore(db());
  return store;
}

export function freshSeed(): string {
  return seedFromBytes(randomBytes(4));
}

/** The rank page's longer board (R4-9, D-227); the cabinet keeps BOARD_LIMIT. */
export const RANK_LIMIT = 50;

export async function readBoard(game: ArcadeGame, address: string | null, limit: number = BOARD_LIMIT): Promise<BoardWire> {
  const engineVersion = ENGINE_VERSION[game];
  const seed = freshSeed();
  const scores = arcadeStore();
  if (!scores) return { configured: false, seed, engineVersion, rows: [], me: null };
  const rows = await scores.board(game, engineVersion, Math.min(Math.max(1, limit), RANK_LIMIT));
  let me: BoardWire["me"] = null;
  if (address) {
    const best = await scores.best(address, game, engineVersion);
    if (best !== null) me = { best, rank: await scores.rank(game, engineVersion, best) };
  }
  return { configured: true, seed, engineVersion, rows, me };
}

export async function acceptScore(claim: ScoreClaim, wallet: string | null, ip: string): Promise<ScoreVerdict> {
  const scores = arcadeStore();
  if (!scores) return { ok: false, status: 503, error: "This deployment keeps no scores." };
  if (!wallet) return { ok: false, status: 401, error: "sign in to post" };

  const engineVersion = ENGINE_VERSION[claim.game];
  if (claim.engineVersion !== engineVersion) return { ok: false, status: 409, error: "that run was played on another engine build" };

  const envelope = envelopeCheck(claim.game, claim.durationMs, claim.trace, claim.score);
  if (!envelope.ok) return { ok: false, status: 422, error: envelope.why };

  const replay = replayArcade(claim.game, claim.seed, claim.trace, { calm: claim.calm });
  if (!replay.ended) return { ok: false, status: 422, error: "the run never ended" };
  if (replay.score !== claim.score) return { ok: false, status: 422, error: "the replay does not reproduce that score" };
  if (Math.abs(replay.ticks - envelope.ticks) > 1) return { ok: false, status: 422, error: "the replay does not reproduce that length" };

  const limiter = ceremonyLimiter();
  if (!(await limiter.allow(`arcade:ip:${ip}`, PER_IP_PER_HOUR, 3_600))) return { ok: false, status: 429, error: "too many runs from here this hour" };
  if (!(await limiter.allow(`arcade:addr:${wallet.toLowerCase()}`, PER_ADDRESS_PER_HOUR, 3_600))) return { ok: false, status: 429, error: "too many runs this hour" };

  const previous = await scores.best(wallet, claim.game, engineVersion);
  const isBest = previous === null || claim.score > previous;
  await scores.record({
    game: claim.game,
    wallet,
    score: claim.score,
    engineVersion,
    durationMs: ticksToMs(replay.ticks),
    seed: claim.seed,
    traceHash: createHash("sha256").update(traceCanonical(claim.trace)).digest("hex"),
    calm: claim.calm,
  });
  const rank = await scores.rank(claim.game, engineVersion, claim.score);
  const board = await readBoard(claim.game, wallet);
  return { ok: true, body: { rank, isBest, board } };
}

/** The newest replayed runs on any game (the hall's marquee); `null` when this deployment keeps no scores. */
export async function readRecentRuns(limit: number): Promise<ArcadeRunRow[] | null> {
  const scores = arcadeStore();
  return scores ? scores.recent(Math.min(Math.max(1, limit), 30)) : null;
}

/** One wallet's runs, newest first (its history), with each run's rank on its board now; `null` with no store. */
export async function readRuns(wallet: string, limit: number): Promise<(ArcadeRunRow & { rank: number | null })[] | null> {
  const scores = arcadeStore();
  if (!scores) return null;
  const runs = await scores.byWallet(wallet, Math.min(Math.max(1, limit), 100));
  return Promise.all(runs.map(async (run) => ({ ...run, rank: run.engineVersion === ENGINE_VERSION[run.game] ? await scores.rank(run.game, run.engineVersion, run.score) : null })));
}
