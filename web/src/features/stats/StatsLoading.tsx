// /stats' wait (R4-13a, D-227; R4-10's frame, no inset of its own): the frame with the placeholder its Suspense shows,
// for the page and its loading boundary.
import type { ReactNode } from "react";
import { LoadingState } from "@/components/states";
import { STATS } from "./copy";

export function StatsFrame({ children }: { children: ReactNode }) {
  return <div className="container">{children}</div>;
}

export const StatsReading = () => <LoadingState shape="hero" label={STATS.reading} />;

export function StatsLoading() {
  return (
    <StatsFrame>
      <StatsReading />
    </StatsFrame>
  );
}
