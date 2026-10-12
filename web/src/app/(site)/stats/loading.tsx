// Per-segment loading boundary (D-050), as `/proof/[market]`'s: a slow navigation is never silent.
import { LoadingState } from "@/components/states/LoadingState";

export default function Loading() {
  return <LoadingState shape="page" className="container py-10" />;
}
