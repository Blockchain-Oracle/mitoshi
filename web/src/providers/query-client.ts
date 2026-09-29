// Ported from Masayume 68f7a09:web/src/providers/query-client.ts — per TanStack Query 5 "Advanced SSR": a new client
// per server request and one singleton in the browser (a Suspense re-render must not rebuild it), a non-zero
// `staleTime` so hydrated data isn't refetched at once, pending queries dehydrated so RSC prefetches stream, errors
// not redacted (Next detects dynamic rendering by thrown errors). Polling is visibility-gated everywhere (AD-6).
import { defaultShouldDehydrateQuery, isServer, QueryClient } from "@tanstack/react-query";

const DEFAULT_STALE_MS = 5_000;

function makeQueryClient(): QueryClient {
  return new QueryClient({
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
  browserClient ??= makeQueryClient();
  return browserClient;
}
