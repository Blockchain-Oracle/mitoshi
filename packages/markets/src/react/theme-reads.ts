"use client";
/**
 * `/themes*`'s hooks (S16a; R4-11, D-227) over `themes/reads.ts`, keyed under `themeKeys`; `invalidateThemes` after a
 * confirmed `theme-*` write. The catalogue polls slowly; a theme's activity (an event walk) is cached for a minute.
 */
import type { Address, Reading } from "@cwf/core";
import type { QueryClient } from "@tanstack/react-query";
import { getFollow, getLatestRebalanceFor, getTheme, getThemeActivity, getThemeHoldings, listEligibleMirrors, listThemes, type ThemeActivity, type ThemeView } from "../themes/reads";
import { useReadingQuery } from "./useReadingQuery";

const LIST_POLL_MS = 30_000;

export const themeKeys = {
  all: () => ["cwf", "themes"] as const,
  list: () => ["cwf", "themes", "list"] as const,
  one: (id: bigint | null) => ["cwf", "themes", "one", id?.toString() ?? null] as const,
  eligible: () => ["cwf", "themes", "eligible"] as const,
  activity: (id: bigint | null) => ["cwf", "themes", "activity", id?.toString() ?? null] as const,
  holdings: (who: string | null, id: bigint | null) => ["cwf", "themes", "holdings", who?.toLowerCase() ?? null, id?.toString() ?? null] as const,
  follow: (who: string | null, id: bigint | null) => ["cwf", "themes", "follow", who?.toLowerCase() ?? null, id?.toString() ?? null] as const,
};

export async function invalidateThemes(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: themeKeys.all() });
}

export function useThemes(): Reading<ThemeView[]> | null {
  return useReadingQuery(themeKeys.list(), () => listThemes(), { pollMs: LIST_POLL_MS });
}

export function useTheme(id: bigint | null): Reading<ThemeView | null> | null {
  return useReadingQuery(themeKeys.one(id), () => getTheme(id!), { enabled: id !== null, pollMs: LIST_POLL_MS });
}

export function useEligibleMirrors() {
  return useReadingQuery(themeKeys.eligible(), () => listEligibleMirrors(), { staleTimeMs: 60_000 });
}

export function useThemeActivity(id: bigint | null): Reading<ThemeActivity> | null {
  return useReadingQuery(themeKeys.activity(id), () => getThemeActivity(id!), { enabled: id !== null, staleTimeMs: 60_000, pollMs: 60_000 });
}

export function useThemeFollow(who: Address | null, id: bigint | null) {
  return useReadingQuery(themeKeys.follow(who, id), () => getFollow(who!, id!), { enabled: who !== null && id !== null, pollMs: LIST_POLL_MS });
}

export function useThemeHoldings(who: Address | null, id: bigint | null) {
  return useReadingQuery(themeKeys.holdings(who, id), () => getThemeHoldings(who!, id!), { enabled: who !== null && id !== null, pollMs: LIST_POLL_MS });
}

/** The follower's latest theme rebalance (the reel's card); polled slowly, an event walk. */
export function useLatestThemeRebalance(who: Address | null) {
  return useReadingQuery(["cwf", "themes", "latest", who?.toLowerCase() ?? null], () => getLatestRebalanceFor(who!), { enabled: who !== null, staleTimeMs: 120_000, pollMs: 120_000 });
}
