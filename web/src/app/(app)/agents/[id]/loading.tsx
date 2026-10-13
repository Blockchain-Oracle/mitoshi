// Per-segment loading boundary (D-050) for an agent's page (R4-6, D-227): the cockpit's own shape — the head with its
// portrait and toolbar, the record beside the next read, the tabs — so a navigation here draws the same placeholder the
// page's Suspense and the island draw, and the content replaces it in place (not the group's generic `page` grid first).
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { cockpit as cockpitShape } from "@/components/states/shapes/automate";

export default function Loading() {
  return <LoadingFrame shape="cockpit" label="Reading the agent">{cockpitShape()}</LoadingFrame>;
}
