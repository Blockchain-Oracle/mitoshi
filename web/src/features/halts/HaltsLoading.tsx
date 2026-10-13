// /status/halts' wait (R4-13a, D-227; R4-10's status frame): the frame with the placeholder its Suspense shows, for the
// page and its loading boundary (without it, /status's own wait would stand in for this page).
import { HALTS } from "./copy";
import "@/styles/status.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { halts as haltsShape } from "@/components/states/shapes/status";

/** R6 (T18): the halts card, its strip and the ticker rows — not the markets hero. */
export const HaltsReading = () => <LoadingFrame shape="halts" label={HALTS.reading}>{haltsShape()}</LoadingFrame>;

export function HaltsLoading() {
  return (
    <div className="container status-page">
      <HaltsReading />
    </div>
  );
}
