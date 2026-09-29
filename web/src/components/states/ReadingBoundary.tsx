// Ported from Masayume 68f7a09:web/src/components/states/ReadingBoundary.tsx
import { isOk, type Reading, type StaleReason } from "@cwf/core";
import type { ReactNode } from "react";
import { EmptyState, type NextAction } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState, type LoadingShape } from "./LoadingState";
import { StaleTick } from "./StaleTick";

export interface ReadingMeta {
  stale: boolean;
  asOfMs: number;
  staleReason?: StaleReason;
}

interface ReadingBoundaryProps<T> {
  /** `null` = nothing ever known (skeleton); the port never returns null once it has answered. */
  reading: Reading<T> | null;
  shape?: LoadingShape;
  isEmpty?: (value: T) => boolean;
  empty?: { why: string; nextAction?: NextAction };
  retry?: () => void;
  /** Set false when the child renders its own StaleTick from `meta`. */
  tick?: boolean;
  className?: string;
  children: (value: T, meta: ReadingMeta) => ReactNode;
}

/** The one consumer of Reading<T>: loading → skeleton, error → honest diagnosis, stale → last-good + tick. */
export function ReadingBoundary<T>({
  reading,
  shape = "plate",
  isEmpty,
  empty,
  retry,
  tick = true,
  className,
  children,
}: ReadingBoundaryProps<T>) {
  if (reading === null) return <LoadingState shape={shape} className={className} />;
  if (!isOk(reading)) return <ErrorState diagnosis={reading.error} retry={retry} className={className} />;
  if (empty && isEmpty?.(reading.value)) return <EmptyState why={empty.why} nextAction={empty.nextAction} className={className} />;

  const meta: ReadingMeta = { stale: reading.stale, asOfMs: reading.asOfMs, staleReason: reading.staleReason };
  return (
    <>
      {children(reading.value, meta)}
      {tick && reading.stale && <StaleTick asOfMs={reading.asOfMs} reason={reading.staleReason} />}
    </>
  );
}
