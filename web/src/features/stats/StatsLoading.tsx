// /stats' wait (R4-13a, D-227; R4-10's frame, no inset of its own): the frame with the placeholder its Suspense shows,
// for the page and its loading boundary.
import type { ReactNode } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { STATS } from "./copy";
import "@/styles/stats.css";

export function StatsFrame({ children }: { children: ReactNode }) {
  return <div className="container">{children}</div>;
}

/** R6 (T18): the counter plate and the growth card where they land — not the markets hero. */
export const StatsReading = () => <LoadingState shape="stats" label={STATS.reading} />;

export function StatsLoading() {
  return (
    <StatsFrame>
      <StatsReading />
    </StatsFrame>
  );
}
