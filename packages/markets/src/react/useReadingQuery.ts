// Ported from Masayume 68f7a09:packages/markets/src/react/useReadingQuery.ts — TanStack Query over a port read. A
// first-ever infrastructure failure rejects (so TanStack retries it); a domain failure (revert, not deployed) resolves
// as the error arm, because it is an answer, not an outage. A failed refresh keeps the last-good value, stale.
// D-230: the public RPC's per-IP limit ("rate-limited", 429 / -32005) is an outage too, not an answer — it replaced a
// Window's last-good opening print with an error, and the terminal said "Waiting for the opening print" over a Window
// trading for minutes. It now retries with TanStack's backoff (1 s, 2 s) and a refresh it fails keeps the last value.
import { err, type DiagnosisKind, type Reading } from "@cwf/core";
import { queryOptions, useQuery, type QueryKey } from "@tanstack/react-query";
import { diagnose } from "../errors/error-map";
import { ReadingError } from "../errors/reading-error";

const DEFAULT_STALE_MS = 5_000;
const MAX_READ_RETRIES = 2;
const RETRYABLE_READ_KINDS: ReadonlySet<DiagnosisKind> = new Set<DiagnosisKind>(["indexer-down", "rpc-down", "rate-limited", "send-unknown", "unknown"]);

export function isInfrastructureFailure(error: unknown): boolean {
  return RETRYABLE_READ_KINDS.has(diagnose(error).kind);
}

export type PollInterval<T> = number | ((reading: Reading<T> | null) => number | false);

export interface ReadingQueryOptions<T> {
  pollMs?: PollInterval<T>;
  enabled?: boolean;
  staleTimeMs?: number;
}

/** The query a port read runs as (key, fetch, retry, poll, freshness) — `useReadingQuery`'s, reusable by `useQueries`. */
export function readingQueryOptions<T>(queryKey: QueryKey, read: () => Promise<Reading<T>>, options: ReadingQueryOptions<T> = {}) {
  const { pollMs, enabled = true, staleTimeMs } = options;
  return queryOptions({
    queryKey,
    queryFn: async (): Promise<Reading<T>> => {
      const reading = await read().catch((error) => err(diagnose(error)));
      if (!reading.ok && isInfrastructureFailure(reading.error)) throw new ReadingError(reading.error);
      return reading;
    },
    enabled,
    retry: (failureCount, error) => failureCount < MAX_READ_RETRIES && isInfrastructureFailure(error),
    refetchInterval: typeof pollMs === "function" ? (q) => pollMs(q.state.data ?? null) : (pollMs ?? false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: staleTimeMs ?? (typeof pollMs === "number" ? pollMs : DEFAULT_STALE_MS),
  });
}

/** A query's state as a Reading: the value, the failure, or null before any result exists. */
export function readingOf<T>(query: { data: Reading<T> | undefined; isError: boolean; error: unknown }): Reading<T> | null {
  const data = query.data ?? null;
  if (data) return data;
  if (query.isError) return err(diagnose(query.error));
  return null;
}

/** Returns null only before any result exists. */
export function useReadingQuery<T>(queryKey: QueryKey, read: () => Promise<Reading<T>>, options: ReadingQueryOptions<T> = {}): Reading<T> | null {
  return readingOf(useQuery(readingQueryOptions(queryKey, read, options)));
}
