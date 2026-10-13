// /status's wait (R4-13a, D-227; R4-10's status frame): the frame with the placeholder its Suspense shows, for the page
// and its loading boundary.
import { LoadingState } from "@/components/states/LoadingState";
import { STATUS } from "./copy";
import "@/styles/status.css";

/** R6 (T18): the verdict card, its dot strip and the check rows — not the markets hero. */
export const StatusReading = () => <LoadingState shape="status" label={STATUS.reading} />;

export function StatusLoading() {
  return (
    <div className="container status-page">
      <StatusReading />
    </div>
  );
}
