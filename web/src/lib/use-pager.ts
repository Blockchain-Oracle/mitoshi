"use client";
// Ported from Masayume 68f7a09:web/src/lib/use-pager.ts

import { type ReactNode, useEffect, useState } from "react";

/** One row of a paged list, rendered by whoever owns the data; the pager only counts and slices. */
export interface ListItem {
  key: string;
  node: ReactNode;
}

export interface PagerState<T> {
  page: number;
  pageCount: number;
  pageSize: number;
  /** The rows on the current page. */
  slice: readonly T[];
  /** 1-based bounds of the current page, for "1–8 of 23". */
  from: number;
  to: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  prev: () => void;
  next: () => void;
}

/**
 * Pages of a list already in hand — the reference's history shows eight rows (`HISTORY_ROWS`) and
 * the owner asked for a next page rather than an endless scroll (2026-09-04). Client-side only: the
 * reading is what it is, the pager never fetches. A list that shrinks under the current page snaps
 * back to the last page that exists.
 */
export function usePager<T>(rows: readonly T[], pageSize = 8): PagerState<T> {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  useEffect(() => {
    if (page !== current) setPage(current);
  }, [page, current]);
  const start = current * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    page: current,
    pageCount,
    pageSize,
    slice,
    from: rows.length === 0 ? 0 : start + 1,
    to: start + slice.length,
    total: rows.length,
    canPrev: current > 0,
    canNext: current < pageCount - 1,
    prev: () => setPage((p) => Math.max(0, Math.min(p, pageCount - 1) - 1)),
    next: () => setPage((p) => Math.min(pageCount - 1, p + 1)),
  };
}
