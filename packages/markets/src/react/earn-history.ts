"use client";
/**
 * Earn's history hooks (R6 money, S09; D-230) over `earn/history.ts`, keyed under `/earn`'s own `["cwf", "earn"]` so a
 * supply or withdraw refreshes them with the rest of the page. The series polls slowly (the pricer samples every 10
 * minutes); the launch time never changes.
 */
import type { Reading, ReserveKind } from "@cwf/core";
import { getReserveHistory, getReserveLaunchedAtSec, type HistoryRange, type ReserveHistory } from "../earn/history";
import { useReadingQuery } from "./useReadingQuery";

const HISTORY_POLL_MS = 120_000;

export const earnHistoryKeys = {
  history: (kind: ReserveKind, range: HistoryRange) => ["cwf", "earn", "history", kind, range] as const,
  launched: (kind: ReserveKind) => ["cwf", "earn", "launched", kind] as const,
};

export function useReserveHistory(kind: ReserveKind, range: HistoryRange, enabled = true): Reading<ReserveHistory> | null {
  return useReadingQuery(earnHistoryKeys.history(kind, range), () => getReserveHistory(kind, range), { pollMs: HISTORY_POLL_MS, enabled });
}

export function useReserveLaunchedAt(kind: ReserveKind, enabled = true): Reading<number | null> | null {
  return useReadingQuery(earnHistoryKeys.launched(kind), () => getReserveLaunchedAtSec(kind), { staleTimeMs: Number.POSITIVE_INFINITY, enabled });
}
