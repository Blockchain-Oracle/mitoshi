import "server-only";
/**
 * The halts board's read (S6): halt-watch's log for the last 30 days (`GET /halts/log`, its rows in write order) and the
 * board holding now (`GET /session`'s `halts`), from ops at request time, kept a minute. Null when ops can't be read —
 * the page then says so and shows no board, never an empty one that reads as "no halts".
 */
import { cacheLife } from "next/cache";
import { parseHaltBoard } from "@/features/markets/session/model";
import { webEnv } from "@/lib/env";
import { BOARD_DAYS, boardRows, type BoardRow } from "./board";
import { haltEpisodes, type HaltEpisode, type HaltLogRow } from "./episodes";

export interface HaltsBoard {
  rows: BoardRow[];
  /** Every episode in the window, newest first. */
  episodes: HaltEpisode[];
  coveredFromSec: number | null;
  nowSec: number;
}

async function ops(path: string): Promise<unknown> {
  const base = webEnv.markets.opsUrl;
  if (!base) throw new Error("no ops URL");
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ops ${path} ${res.status}`);
  return res.json();
}

async function computeBoard(): Promise<HaltsBoard> {
  "use cache";
  cacheLife("minutes");
  const nowSec = Math.floor(Date.now() / 1000);
  const from = nowSec - (BOARD_DAYS + 1) * 86_400;
  const [log, session] = await Promise.all([ops(`/halts/log?from=${from}`), ops("/session")]);
  const rows = ((log as { rows?: HaltLogRow[] }).rows ?? []).filter((r) => !r.fixture);
  const episodes = haltEpisodes(rows);
  const coveredFromSec = rows.length ? Number(rows[0]!.pass_sec) : null;
  const live = parseHaltBoard((session as { halts?: unknown }).halts);
  return { rows: boardRows(episodes, live, coveredFromSec, nowSec), episodes: [...episodes].reverse(), coveredFromSec, nowSec };
}

export async function readHaltsBoard(): Promise<HaltsBoard | null> {
  try {
    return await computeBoard();
  } catch {
    return null;
  }
}
