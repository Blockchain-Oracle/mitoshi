// Per-segment loading boundary (D-050): partial prefetch fetches the shell down to here, and a slow navigation is
// never silent (ux-audit §8: zero loading.tsx before).
import { LoadingState } from "@/components/states/LoadingState";

export default function Loading() {
  return <LoadingState shape="hero" />;
}
