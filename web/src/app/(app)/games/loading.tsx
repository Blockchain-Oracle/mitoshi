// The route's loading boundary (R4-13a, D-227; plan §3.2 per-segment loading): the games islands' own placeholder (a
// container with the page shape), drawn here without importing the islands — the arcade routes under /games carry this
// boundary too, so it stays as light as the group's.
import { LoadingState } from "@/components/states/LoadingState";

export default function Loading() {
  return (
    <div className="container">
      <LoadingState shape="page" label="Loading" />
    </div>
  );
}
