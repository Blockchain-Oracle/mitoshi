// The route's loading boundary (R4-13a, D-227; plan §3.2 per-segment loading): the page's own wait, so a navigation
// shows one shape that the screen replaces in place, never the group's generic page first.
import { ProofLoading } from "@/features/proof/ProofLoading";

export default function Loading() {
  return <ProofLoading />;
}
