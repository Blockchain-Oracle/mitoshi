// The skeleton's frame (R6 T18, D-230): the one live status around any shape — `role="status"`, `aria-busy`, the label,
// `data-loading-shape` (the splash and the probes read it) — and the no-flash delay, in CSS (`.skel-delay`), so a server
// boundary ships no script for it. An island that cares about its bundle imports its one shape and this frame instead
// of the LoadingState registry.
import type { CSSProperties, ReactNode } from "react";

export interface LoadingFrameProps {
  /** The shape's name, for `data-loading-shape`. */
  shape: string;
  label?: string;
  className?: string;
  /** Keep the box invisible for this long (it is still reserved, so nothing jumps); default 0. */
  delayMs?: number;
  /** `contents`: the shape's boxes sit directly in the parent's layout (a page outline inside its own grid). */
  layout?: "stack" | "contents";
  children: ReactNode;
}

export function LoadingFrame({ shape, label = "Loading", className, delayMs = 0, layout = "stack", children }: LoadingFrameProps) {
  const base = layout === "contents" ? "contents" : "flex flex-col gap-3";
  const cls = `${base}${delayMs > 0 ? " skel-delay" : ""}${className ? ` ${className}` : ""}`;
  const style = delayMs > 0 ? ({ "--skel-delay": `${delayMs}ms` } as CSSProperties) : undefined;
  return (
    <div role="status" aria-busy="true" aria-label={label} data-loading-shape={shape} className={cls} style={style}>
      {children}
    </div>
  );
}
