"use client";
/**
 * `/launch*`'s hooks (S17; R4-11, D-227) over `launch/reads.ts`, one keyed query each under `launchKeys`, so a confirmed
 * `launch-*` write refreshes them all with `invalidateLaunch`. A token's own state polls while its page is open. A
 * network without the launchpads answers empty. R6 money (S02 + S08, D-230): the board and a token's trades and holders
 * come from the index in one request each (`/api/launch`), refetched on the stream's `launches` / `launch:<token>`
 * with a slow poll behind it — the browser no longer walks the launchpad's logs.
 */
import type { Address, LaunchBoardWire, LaunchFeedWire, Reading } from "@cwf/core";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { MemeLaunch } from "../launch/memeRead";
import { getMemeClaims, getMemeLaunch, getMemePosition, getStablecoinLaunch, listMemeTemplates, quotePoolSwap, type MemeTemplate, type StablecoinView } from "../launch/reads";
import { withReading } from "../runtime/reading";
import { useStreamTopic } from "./stream";
import { useReadingQuery } from "./useReadingQuery";

const LIST_POLL_MS = 30_000;
const TOKEN_POLL_MS = 10_000;
const FEED_POLL_MS = 10_000;
const BOARD_POLL_MS = 15_000;

async function fetchLaunchApi<T>(key: string, query: string): Promise<Reading<T>> {
  return withReading(key, async () => {
    const res = await fetch(`/api/launch${query}`);
    if (!res.ok) throw new Error(`launch index ${res.status}`);
    return (await res.json()) as T;
  });
}

export const launchKeys = {
  all: () => ["cwf", "launch"] as const,
  board: (includeTeam: boolean) => ["cwf", "launch", "board", includeTeam] as const,
  feed: (token: string | null) => ["cwf", "launch", "feed", token?.toLowerCase() ?? null] as const,
  templates: () => ["cwf", "launch", "templates"] as const,
  meme: (token: string | null) => ["cwf", "launch", "meme", token?.toLowerCase() ?? null] as const,
  position: (token: string | null, holder: string | null) => ["cwf", "launch", "position", token?.toLowerCase() ?? null, holder?.toLowerCase() ?? null] as const,
  claims: (holder: string | null, coin: string | null) => ["cwf", "launch", "claims", holder?.toLowerCase() ?? null, coin?.toLowerCase() ?? null] as const,
  stablecoin: (token: string | null) => ["cwf", "launch", "stablecoin", token?.toLowerCase() ?? null] as const,
  poolQuote: (token: string | null, buyCoin: boolean, amountIn: string) => ["cwf", "launch", "poolQuote", token?.toLowerCase() ?? null, buyCoin, amountIn] as const,
};

/** After a confirmed `launch-*` write: every launch read refetches (the list, the token, its trades, the position). */
export async function invalidateLaunch(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: launchKeys.all() });
}

/** The board (index): every public launch, or with the team's QA launches; refetched when any launch moves. */
export function useLaunchBoard(includeTeam: boolean): Reading<LaunchBoardWire> | null {
  const queryClient = useQueryClient();
  useStreamTopic("launches", () => void queryClient.invalidateQueries({ queryKey: launchKeys.board(includeTeam) }));
  return useReadingQuery(launchKeys.board(includeTeam), () => fetchLaunchApi<LaunchBoardWire>(`launchBoard:${includeTeam}`, includeTeam ? "?test=1" : ""), { pollMs: BOARD_POLL_MS });
}

/** One launch's facts, trades and holders (index), in one request; refetched on its own stream topic. */
export function useLaunchFeed(token: Address | null): Reading<LaunchFeedWire> | null {
  const queryClient = useQueryClient();
  useStreamTopic(token ? `launch:${token.toLowerCase()}` : null, () => void queryClient.invalidateQueries({ queryKey: launchKeys.feed(token) }));
  return useReadingQuery(launchKeys.feed(token), () => fetchLaunchApi<LaunchFeedWire>(`launchFeed:${token!.toLowerCase()}`, `?token=${token}`), { enabled: token !== null, pollMs: FEED_POLL_MS });
}

export function useMemeTemplates(): Reading<MemeTemplate[]> | null {
  return useReadingQuery(launchKeys.templates(), () => listMemeTemplates(), { staleTimeMs: 5 * 60_000 });
}

export function useMemeLaunch(token: Address | null): Reading<MemeLaunch | null> | null {
  return useReadingQuery(launchKeys.meme(token), () => getMemeLaunch(token!), { enabled: token !== null, pollMs: TOKEN_POLL_MS });
}

export function useMemePosition(token: Address | null, holder: Address | null) {
  return useReadingQuery(launchKeys.position(token, holder), () => getMemePosition(token!, holder!), { enabled: token !== null && holder !== null, pollMs: TOKEN_POLL_MS });
}

export function useMemeClaims(holder: Address | null, coin: Address | null) {
  return useReadingQuery(launchKeys.claims(holder, coin), () => getMemeClaims(holder!, coin ?? undefined), { enabled: holder !== null, pollMs: LIST_POLL_MS });
}

export function useStablecoinLaunch(token: Address | null): Reading<StablecoinView | null> | null {
  return useReadingQuery(launchKeys.stablecoin(token), () => getStablecoinLaunch(token!), { enabled: token !== null, pollMs: LIST_POLL_MS });
}

/** A graduated memecoin's pool quote (V4Quoter) for the trade sheet; refreshed every 10 s while it is open. */
export function usePoolQuote(p: { token: Address; fee: number; tickSpacing: number; buyCoin: boolean; amountIn: bigint } | null): Reading<bigint | null> | null {
  return useReadingQuery(launchKeys.poolQuote(p?.token ?? null, p?.buyCoin ?? true, (p?.amountIn ?? 0n).toString()), () => quotePoolSwap(p!), { enabled: p !== null && p.amountIn > 0n, pollMs: TOKEN_POLL_MS });
}
