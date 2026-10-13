// /status/halts' wait (R4-13a, D-227; R4-10's status frame): the frame with the placeholder its Suspense shows, for the
// page and its loading boundary (without it, /status's own wait would stand in for this page).
import { LoadingState } from "@/components/states/LoadingState";
import { HALTS } from "./copy";
import "@/styles/status.css";

/** R6 (T18): the halts card, its strip and the ticker rows — not the markets hero. */
export const HaltsReading = () => <LoadingState shape="halts" label={HALTS.reading} />;

export function HaltsLoading() {
  return (
    <div className="container status-page">
      <HaltsReading />
    </div>
  );
}
