// /status/halts' wait (R4-13a, D-227; R4-10's status frame): the frame with the placeholder its Suspense shows, for the
// page and its loading boundary (without it, /status's own wait would stand in for this page).
import { LoadingState } from "@/components/states";
import { HALTS } from "./copy";
import "@/styles/status.css";

export const HaltsReading = () => <LoadingState shape="hero" label={HALTS.reading} />;

export function HaltsLoading() {
  return (
    <div className="container status-page">
      <HaltsReading />
    </div>
  );
}
