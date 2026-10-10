/**
 * Halt episodes from halt-watch's log (S6, the halts board): ops `GET /halts/log` holds one row per pass that saw a halt
 * reason or changed the confirmed board, in write order (D-186). Walking `confirmed` row by row gives, per asset, when
 * each halt began, why, and when it lifted — an asset that leaves the board, or changes reason, ends its episode at that
 * row's pass. A fixture run (S3's `HALT_WATCH_FIXTURE`) is a rehearsal, never a halt: its rows are skipped.
 */
import { HALT_REASONS, type HaltReason } from "@cwf/core";

export interface HaltLogRow {
  id: string;
  pass_sec: string;
  confirmed: Record<string, string>;
  fixture: string | null;
}

export interface HaltEpisode {
  /** `TSLA`, `TSLA-24` (a stock's 24/7 feed) or a crypto ticker. */
  asset: string;
  reason: HaltReason;
  startSec: number;
  /** Null while it still holds. */
  endSec: number | null;
}

const isReason = (v: unknown): v is HaltReason => (HALT_REASONS as readonly unknown[]).includes(v);

/** Every episode in the log, oldest first. */
export function haltEpisodes(rows: readonly HaltLogRow[]): HaltEpisode[] {
  const open = new Map<string, HaltEpisode>();
  const done: HaltEpisode[] = [];
  for (const row of rows) {
    if (row.fixture) continue;
    const at = Number(row.pass_sec);
    const board = row.confirmed ?? {};
    for (const [asset, ep] of open) {
      if (board[asset] === ep.reason) continue;
      done.push({ ...ep, endSec: at });
      open.delete(asset);
    }
    for (const [asset, reason] of Object.entries(board)) {
      if (!isReason(reason) || open.has(asset)) continue;
      open.set(asset, { asset, reason, startSec: at, endSec: null });
    }
  }
  return [...done, ...open.values()].sort((a, b) => a.startSec - b.startSec || a.asset.localeCompare(b.asset));
}

/** Seconds of `[fromSec, toSec)` an episode covers (an open one runs to `nowSec`). */
export function overlapSec(ep: HaltEpisode, fromSec: number, toSec: number, nowSec: number): number {
  const end = Math.min(ep.endSec ?? nowSec, toSec);
  return Math.max(0, end - Math.max(ep.startSec, fromSec));
}
