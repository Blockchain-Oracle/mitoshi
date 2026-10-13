"use client";
// The card's follow state once the wallet's consents are read (R6, D-230; D-231): "Following" for a basket it copies,
// else Follow. Loaded only for a signed-in wallet with the data layer up (`CardFollow`).
import { useMyStrategies } from "@/features/strategies/useStrategies";
import { FollowingPill, FollowPill, type CardFollowProps } from "./CardFollow";

export function CardFollowing({ who, ...props }: CardFollowProps & { who: string }) {
  const mine = useMyStrategies(who);
  const following = mine.data?.subscriptions.some((s) => s.active && s.strategyId === props.strategyId) ?? false;
  return following ? <FollowingPill {...props} /> : <FollowPill {...props} />;
}
