"use client";
// The tracker in a drawer (Portfolio's "In flight"; R4-12, D-227): one recorded transfer restored by its hash, shown
// with its legs.
import { LoadingState } from "@/components/states";
import { TrackerView } from "./TrackerView";
import { useTracker } from "./useTracker";
import "@/styles/bridge-kit.css";

export function DrawerTracker({ srcTx }: { srcTx: string }) {
  const tracker = useTracker(null, srcTx);
  return tracker.tracked ? <TrackerView tracker={tracker} showLegs /> : <LoadingState shape="row" />;
}
