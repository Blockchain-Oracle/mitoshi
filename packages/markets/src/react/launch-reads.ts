"use client";
/**
 * `/launch*`'s hooks (S17; R4-11, D-227) over `launch/reads.ts`, one keyed query each under `launchKeys`, so a confirmed
 * `launch-*` write refreshes them all with `invalidateLaunch`. Lists poll slowly (a launch is minutes, not seconds); a
 * token's own state and trades poll faster while its page is open. A network without the launchpads answers empty.
 */
import type { Address, Reading } from "@cwf/core";
import type { QueryClient } from "@tanstack/react-query";
import type { MemeLaunch, MemeTrade } from "../launch/memeRead";
import { getMemeClaims, getMemeLaunch, getMemePosition, getMemeTrades, getStablecoinLaunch, listLaunches, listMemeTemplates, type LaunchRow, type MemeTemplate, type StablecoinView } from "../launch/reads";
import { useReadingQuery } from "./useReadingQuery";

const LIST_POLL_MS = 30_000;
const TOKEN_POLL_MS = 10_000;

export const launchKeys = {
  all: () => ["cwf", "launch"] as const,
  list: (limit: number) => ["cwf", "launch", "list", limit] as const,
  templates: () => ["cwf", "launch", "templates"] as const,
  meme: (token: string | null) => ["cwf", "launch", "meme", token?.toLowerCase() ?? null] as const,
  trades: (token: string | null) => ["cwf", "launch", "trades", token?.toLowerCase() ?? null] as const,
  position: (token: string | null, holder: string | null) => ["cwf", "launch", "position", token?.toLowerCase() ?? null, holder?.toLowerCase() ?? null] as const,
  claims: (holder: string | null, coin: string | null) => ["cwf", "launch", "claims", holder?.toLowerCase() ?? null, coin?.toLowerCase() ?? null] as const,
  stablecoin: (token: string | null) => ["cwf", "launch", "stablecoin", token?.toLowerCase() ?? null] as const,
};

/** After a confirmed `launch-*` write: every launch read refetches (the list, the token, its trades, the position). */
export async function invalidateLaunch(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: launchKeys.all() });
}

export function useLaunches(limit = 50): Reading<LaunchRow[]> | null {
  return useReadingQuery(launchKeys.list(limit), () => listLaunches(limit), { pollMs: LIST_POLL_MS });
}

export function useMemeTemplates(): Reading<MemeTemplate[]> | null {
  return useReadingQuery(launchKeys.templates(), () => listMemeTemplates(), { staleTimeMs: 5 * 60_000 });
}

export function useMemeLaunch(token: Address | null): Reading<MemeLaunch | null> | null {
  return useReadingQuery(launchKeys.meme(token), () => getMemeLaunch(token!), { enabled: token !== null, pollMs: TOKEN_POLL_MS });
}

export function useMemeTrades(token: Address | null, enabled = true): Reading<MemeTrade[]> | null {
  return useReadingQuery(launchKeys.trades(token), () => getMemeTrades(token!), { enabled: enabled && token !== null, pollMs: LIST_POLL_MS });
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
