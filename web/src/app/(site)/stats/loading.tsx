// Per-segment loading boundary (D-050), as `/proof/[market]`'s: a slow navigation is never silent.
import { LoadingState } from "@/components/states/LoadingState";

export default function Loading() {
  return <LoadingState shape="plate" className="px-gutter py-6 lg:px-gutter-desktop" />;
}
