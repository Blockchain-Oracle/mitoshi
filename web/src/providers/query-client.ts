// Ported from Masayume 68f7a09:web/src/providers/query-client.ts — per TanStack Query 5 "Advanced SSR": a new client
// per server request and one singleton in the browser (a Suspense re-render must not rebuild it), a non-zero
// `staleTime` so hydrated data isn't refetched at once, pending queries dehydrated so RSC prefetches stream, errors
// not redacted (Next detects dynamic rendering by thrown errors). Polling is visibility-gated everywhere (AD-6).
import { defaultShouldDehydrateQuery, isServer, QueryCache, QueryClient } from "@tanstack/react-query";
import { reportReadFailure, reportReadSuccess, setRetryHandler } from "@/lib/connection";

const DEFAULT_STALE_MS = 5_000;

/**
 * Every read's outcome feeds the page's one connection notice (R6 shell S04, lib/connection.ts): the chain port answers
 * with Readings, so a failure is usually data — an error arm, or a last-good value kept stale after a failed refresh —
 * and only sometimes a thrown error. Domain failures are filtered out there.
 */
function reportRead(data: unknown, key: string): void {
  const r = data as { ok?: unknown; error?: { kind?: unknown }; stale?: unknown; staleReason?: unknown } | null;
  if (!r || typeof r !== "object" || typeof r.ok !== "boolean") return reportReadSuccess(key);
  if (r.ok === false) return reportReadFailure(String(r.error?.kind ?? ""), key);
  if (r.stale === true && r.staleReason === "refresh-failed") return reportReadFailure("rpc-down", key);
  reportReadSuccess(key);
}

function browserCache(): QueryCache {
  const cache = new QueryCache({
    onSuccess: (data, query) => reportRead(data, query.queryHash),
    onError: (error, query) => {
      const kind = (error as { kind?: unknown } | null)?.kind;
      reportReadFailure(typeof kind === "string" ? kind : /429|rate.?limit/i.test(String(error)) ? "rate-limited" : "", query.queryHash);
    },
  });
  // A failed read that leaves the screen no longer holds the notice open.
  cache.subscribe((event) => void (event.type === "removed" && reportReadSuccess(event.query.queryHash)));
  return cache;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    ...(isServer ? {} : { queryCache: browserCache() }),
    defaultOptions: {
      queries: { staleTime: DEFAULT_STALE_MS, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: 1 },
      dehydrate: {
        shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === "pending",
        shouldRedactErrors: () => false,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

/** One QueryClient shared by wagmi and the app (web-stack §3.3). */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserClient) {
    const client = (browserClient = makeQueryClient());
    // A retry refetches what is on screen and failed or went stale.
    setRetryHandler(() => client.refetchQueries({ type: "active", predicate: (q) => q.state.status === "error" || q.isStale() }));
  }
  return browserClient;
}
