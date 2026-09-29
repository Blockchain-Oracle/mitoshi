// Ported from Masayume 68f7a09:web/src/components/states/LoadingState.tsx
import type { ReactNode } from "react";

// Bars are drawn here rather than through `ui/skeleton` + `cn`: loading boundaries are in every route's first load, and
// tailwind-merge is not needed when each bar states its own radius (§3.1).
function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-surface-2 motion-reduce:animate-none ${className}`} />;
}

export type LoadingShape = "line" | "row" | "plate" | "chart" | "ticket";

const SHAPES: Record<LoadingShape, () => ReactNode> = {
  line: () => <Skeleton className="h-4 w-2/3 rounded-md" />,
  row: () => (
    <div className="flex items-center gap-3">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2 rounded-md" />
        <Skeleton className="h-3 w-1/3 rounded-md" />
      </div>
    </div>
  ),
  plate: () => <Skeleton className="h-24 w-full rounded-lg" />,
  chart: () => <Skeleton className="h-48 w-full rounded-lg" />,
  ticket: () => (
    <>
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-(--ticket-cta-height) w-full rounded-md" />
    </>
  ),
};

interface LoadingStateProps {
  shape?: LoadingShape;
  label?: string;
  className?: string;
}

/** Skeleton only where nothing was ever known — never an invented number. */
export function LoadingState({ shape = "line", label = "Loading", className }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2"}>
      {SHAPES[shape]()}
    </div>
  );
}
