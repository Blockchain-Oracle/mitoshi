"use client";
// The tracker in a drawer (Portfolio's "In flight"; R4-12, D-227): one recorded transfer restored by its hash, shown
// with its legs — or, when its record can't be read, says so and opens /bridge on that hash.
import { EmptyState, LoadingState } from "@/components/states";
import { BRIDGE } from "./copy";
import { TrackerView } from "./TrackerView";
import { useTracker } from "./useTracker";
import "@/styles/bridge-kit.css";

export function DrawerTracker({ srcTx }: { srcTx: string }) {
  const tracker = useTracker(null, srcTx);
  if (tracker.tracked) return <TrackerView tracker={tracker} showLegs />;
  if (tracker.missing) return <EmptyState why={BRIDGE.track.unread} nextAction={{ label: BRIDGE.track.openBridge, href: `/bridge?tx=${srcTx}` }} />;
  return <LoadingState shape="row" />;
}
