// `/stats` (S5, L-15): wallets that made a call, the venue's own counts and the latest calls, from the index
// (`features/stats`). Read at request time, cached for minutes. R4-10 (D-227): Owarine's frame; no inset of its own.
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { StatsScreen } from "@/features/stats/StatsScreen";
import { STATS } from "@/features/stats/copy";
import "@/styles/stats.css";

export const metadata: Metadata = { title: "Stats", description: "Wallets that made a call on Mitoshi, read from the engine's fills on Tempo testnet, each with its receipt." };

export default function Page() {
  return (
    <div className="container">
      <Suspense fallback={<LoadingState shape="hero" label={STATS.reading} />}>
        <StatsScreen />
      </Suspense>
    </div>
  );
}
