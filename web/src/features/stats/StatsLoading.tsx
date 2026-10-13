// /stats' wait (R4-13a, D-227; R4-10's frame, no inset of its own): the frame with the placeholder its Suspense shows,
// for the page and its loading boundary.
import type { ReactNode } from "react";
import { STATS } from "./copy";
import "@/styles/stats.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { stats as statsShape } from "@/components/states/shapes/stats";

export function StatsFrame({ children }: { children: ReactNode }) {
  return <div className="container">{children}</div>;
}

/** R6 (T18): the counter plate and the growth card where they land — not the markets hero. */
export const StatsReading = () => <LoadingFrame shape="stats" label={STATS.reading}>{statsShape()}</LoadingFrame>;

export function StatsLoading() {
  return (
    <StatsFrame>
      <StatsReading />
    </StatsFrame>
  );
}
