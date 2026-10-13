import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  envelopeCheck,
  HOP_ENGINE_VERSION,
  isArcadeSeed,
  MAX_RUN_SEC,
  MAX_RUN_TICKS,
  replayArcade,
  SLED_ENGINE_VERSION,
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
import { cutTape } from "./tape.server";
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
/** v3 (R4-9, ported from Senryo): Line Rider is the sled, Candle Hop the candle canyon — both on the issued tape. */
export const ENGINE_VERSION: Readonly<Record<ArcadeGame, number>> = { "line-rider": SLED_ENGINE_VERSION, "candle-hop": HOP_ENGINE_VERSION };

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

const ISSUE_TRIES = 4;
/**
 * A seed is good for one score, within the longest run plus time to start it and to sign in at the end (Senryo's
 * `SEED_GRACE_SEC`, widened for sign-in-at-the-end).
 */
const SEED_GRACE_SEC = 1_800;

/**
 * A seed for the next run with the tape it rides (engine v2): drawn, the tape cut from the index's prints, both kept so
 * the score check replays the same terrain. A seed is rankable only if it was issued here.
 */
async function issueRun(scores: ArcadeStore, game: ArcadeGame): Promise<Pick<BoardWire, "seed" | "tape">> {
  for (let i = 0; i < ISSUE_TRIES; i++) {
    const seed = freshSeed();
    const nowSec = Math.floor(Date.now() / 1_000);
    // An index that did not answer issues the seed bare (the seed's own line), so the run still posts.
    const tape = await cutTape(seed, nowSec).catch(() => ({ feed: "", fromSec: nowSec, toSec: nowSec, points: [], moves: [] }));
    if (await scores.issueTape(seed, game, tape)) return { seed, tape: tape.points.length ? tape : null };
  }
  return { seed: freshSeed(), tape: null };
}

export async function readBoard(game: ArcadeGame, address: string | null, limit: number = BOARD_LIMIT, issue = false): Promise<BoardWire> {
  const engineVersion = ENGINE_VERSION[game];
  const scores = arcadeStore();
  if (!scores) return { configured: false, seed: freshSeed(), tape: null, engineVersion, rows: [], me: null };
  const { seed, tape } = issue ? await issueRun(scores, game) : { seed: freshSeed(), tape: null };
  const rows = await scores.board(game, engineVersion, Math.min(Math.max(1, limit), RANK_LIMIT));
  let me: BoardWire["me"] = null;
  if (address) {
    const best = await scores.best(address, game, engineVersion);
    if (best !== null) me = { best, rank: await scores.rank(game, engineVersion, best) };
  }
  return { configured: true, seed, tape, engineVersion, rows, me };
}

export async function acceptScore(claim: ScoreClaim, wallet: string | null, ip: string): Promise<ScoreVerdict> {
  const scores = arcadeStore();
  if (!scores) return { ok: false, status: 503, error: "This deployment keeps no scores." };
  if (!wallet) return { ok: false, status: 401, error: "sign in to post" };

  const engineVersion = ENGINE_VERSION[claim.game];
  if (claim.engineVersion !== engineVersion) return { ok: false, status: 409, error: "that run was played on another engine build" };

  const envelope = envelopeCheck(claim.game, claim.durationMs, claim.trace, claim.score, true);
  if (!envelope.ok) return { ok: false, status: 422, error: envelope.why };

  // Engine v2: the run is replayed on the tape issued with its seed, which the check takes (one score per seed); a seed
  // never issued here, already posted or expired is not rankable.
  const issued = await scores.takeTape(claim.seed, claim.game, MAX_RUN_SEC + SEED_GRACE_SEC);
  if (!issued) return { ok: false, status: 422, error: "that run's seed was not issued here, was posted, or expired" };
  const replay = replayArcade(claim.game, claim.seed, claim.trace, { calm: claim.calm, ...(issued.points.length ? { tape: issued.points } : {}), ...(issued.moves.length ? { moves: issued.moves } : {}) });
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
  const board = await readBoard(claim.game, wallet, BOARD_LIMIT, true);
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
