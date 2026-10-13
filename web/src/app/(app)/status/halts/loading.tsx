// The route's loading boundary (R4-13a, D-227; plan §3.2 per-segment loading): the page's own wait, so a navigation
// shows one shape that the board replaces in place, never the group's generic page first.
import { HaltsLoading } from "@/features/halts/HaltsLoading";

export default function Loading() {
  return <HaltsLoading />;
}
