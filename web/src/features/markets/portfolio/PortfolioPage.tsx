"use client";
// The /portfolio island: the screen once the late data layer exists (§3.1); feature sheets load with the route.
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { PortfolioScreen } from "./PortfolioScreen";
import "@/styles/ledger-plate.css";
import "@/styles/history.css";
import "@/styles/claim-winnings.css";
import "../markets.css";

export function PortfolioPage() {
  const ready = useDataReady();
  if (!ready) return <LoadingState shape="plate" className="mx-auto w-full max-w-(--content-reading) px-gutter py-8" />;
  return <PortfolioScreen />;
}
