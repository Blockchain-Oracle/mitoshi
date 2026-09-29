// Ported from Masayume 68f7a09:packages/markets/src/react/useReadingQuery.ts — TanStack Query over a port read. A
// first-ever infrastructure failure rejects (so TanStack retries it); a domain failure (revert, not deployed) resolves
// as the error arm, because it is an answer, not an outage. A failed refresh keeps the last-good value, stale.
import { err, type DiagnosisKind, type Reading } from "@cwf/core";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { diagnose } from "../errors/error-map";
import { ReadingError } from "../errors/reading-error";

const DEFAULT_STALE_MS = 5_000;
const MAX_READ_RETRIES = 2;
const RETRYABLE_READ_KINDS: ReadonlySet<DiagnosisKind> = new Set<DiagnosisKind>(["indexer-down", "rpc-down", "send-unknown", "unknown"]);

export function isInfrastructureFailure(error: unknown): boolean {
  return RETRYABLE_READ_KINDS.has(diagnose(error).kind);
}

export type PollInterval<T> = number | ((reading: Reading<T> | null) => number | false);

export interface ReadingQueryOptions<T> {
  pollMs?: PollInterval<T>;
  enabled?: boolean;
  staleTimeMs?: number;
}

/** Returns null only before any result exists. */
export function useReadingQuery<T>(queryKey: QueryKey, read: () => Promise<Reading<T>>, options: ReadingQueryOptions<T> = {}): Reading<T> | null {
  const { pollMs, enabled = true, staleTimeMs } = options;
  const query = useQuery({
    queryKey,
    queryFn: async () => {
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
  const data = query.data ?? null;
  if (data) return data;
  if (query.isError) return err(diagnose(query.error));
  return null;
}
