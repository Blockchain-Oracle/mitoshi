// /status's wait (R4-13a, D-227; R4-10's status frame): the frame with the placeholder its Suspense shows, for the page
// and its loading boundary.
import { STATUS } from "./copy";
import "@/styles/status.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { status as statusShape } from "@/components/states/shapes/status";

/** R6 (T18): the verdict card, its dot strip and the check rows — not the markets hero. */
export const StatusReading = () => <LoadingFrame shape="status" label={STATUS.reading}>{statusShape()}</LoadingFrame>;

export function StatusLoading() {
  return (
    <div className="container status-page">
      <StatusReading />
    </div>
  );
}
