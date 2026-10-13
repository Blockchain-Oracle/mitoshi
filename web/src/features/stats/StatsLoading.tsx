// /stats' wait (R4-13a, D-227): the page's frame with the line its Suspense shows, for the page and its loading boundary.
import type { ReactNode } from "react";
import { STATS } from "./copy";

export function StatsFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-(--content-wide) flex-col px-gutter py-12 lg:px-gutter-desktop lg:py-16">{children}</div>;
}

export const StatsReading = () => <p className="type-body text-ink-secondary">{STATS.reading}</p>;

export function StatsLoading() {
  return (
    <StatsFrame>
      <StatsReading />
    </StatsFrame>
  );
}
