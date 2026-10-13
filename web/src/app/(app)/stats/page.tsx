// `/stats` (S5, L-15): wallets that made a call, the venue's own counts and the latest calls, from the index
// (`features/stats`). In the site group (D-215): no wallet stack, read at request time, cached for minutes.
import type { Metadata } from "next";
import { Suspense } from "react";
import { StatsScreen } from "@/features/stats/StatsScreen";
import { StatsFrame, StatsReading } from "@/features/stats/StatsLoading";
import "@/styles/stats.css";

export const metadata: Metadata = { title: "Stats", description: "Wallets that made a call on Mitoshi, read from the engine's fills on Tempo testnet, each with its receipt." };

export default function Page() {
  return (
    <StatsFrame>
      <Suspense fallback={<StatsReading />}>
        <StatsScreen />
      </Suspense>
    </StatsFrame>
  );
}
