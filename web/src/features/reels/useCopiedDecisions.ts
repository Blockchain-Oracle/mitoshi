"use client";
// The reel's two woven cards (R4-11, D-227; D-231): the latest Window a copied agent traded, and the latest call of a
// theme this account follows — each from its runner's own record (`/api/strategies/[id]`). A theme is a basket strategy,
// so both come from the same consents; the spec tells them apart.
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import type { StrategyDetailPayload } from "@/features/strategies/protocol";
import { useMyStrategies } from "@/features/strategies/useStrategies";
import { useWalletSession } from "@/lib/wallet-session";
import type { StrategyReelDecision } from "./StrategyReelCard";

/** At most this many copies are read for the reel (the first active ones). */
const READS = 4;

export function useCopiedDecisions(): { agent: StrategyReelDecision | null; theme: StrategyReelDecision | null } {
  const { address } = useWalletSession();
  const mine = useMyStrategies(address);
  const ids = (mine.data?.subscriptions ?? []).filter((s) => s.active).slice(0, READS).map((s) => s.strategyId);
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["cwf", "strategies", "detail", id],
      queryFn: async (): Promise<StrategyDetailPayload | null> => {
        const res = await fetch(`/api/strategies/${id}`, { cache: "no-store" });
        return res.ok ? ((await res.json()) as StrategyDetailPayload) : null;
      },
      staleTime: 60_000,
    })),
  });
  const key = details.map((d) => d.dataUpdatedAt).join(",");
  return useMemo(() => {
    const items = details.flatMap((q) => {
      const d = q.data;
      const notable = d?.decisions.find((x) => x.gate === "trade");
      return d && notable ? [{ basket: d.strategy.spec?.preset === "basket", item: { strategyId: d.strategy.strategyId, name: d.strategy.name, decision: notable } }] : [];
    });
    return { agent: items.find((x) => !x.basket)?.item ?? null, theme: items.find((x) => x.basket)?.item ?? null };
    // `key` stands for the details' contents.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
