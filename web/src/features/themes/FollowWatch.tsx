"use client";
// Whether the signed-in wallet copies this theme (R6, D-230; D-231): its own consents (`/api/strategies/mine`, the
// desk's read), loaded beside the page once the data layer is up, reported to `FollowRoot`.
import { useEffect } from "react";
import { useMyStrategies } from "@/features/strategies/useStrategies";

export function FollowWatch({ who, strategyId, onChange }: { who: string; strategyId: string; onChange: (following: boolean) => void }) {
  const mine = useMyStrategies(who);
  const following = mine.data?.subscriptions.some((s) => s.active && s.strategyId === strategyId) ?? false;
  useEffect(() => onChange(following), [following, onChange]);
  return null;
}
