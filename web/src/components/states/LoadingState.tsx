// Ported from Masayume 68f7a09:web/src/components/states/LoadingState.tsx; Owarine 90a91d71's shapes plus the page-level
// ones a route's loading boundary draws (D-226): a placeholder shaped like the page it stands in for, shimmering
// (`styles/states.css`, From 21st.dev 19999 animbits/skeleton-loader), never one grey bar. R6 (T18, D-230): the shapes
// live in `./shapes/*` (one file per feature), each page's outline drawn from its settled boxes; this file is the
// registry's front door. Skeleton only where nothing was ever known — never an invented number.
import { LoadingFrame, type LoadingFrameProps } from "./LoadingFrame";
import { SHAPES, type LoadingShape } from "./shapes";

export type { LoadingShape };
export { LoadingFrame };

export interface LoadingStateProps extends Omit<LoadingFrameProps, "shape" | "children"> {
  shape?: LoadingShape;
}

export function LoadingState({ shape = "line", ...frame }: LoadingStateProps) {
  return <LoadingFrame shape={shape} {...frame}>{SHAPES[shape]()}</LoadingFrame>;
}
