// `/u/<address>`'s wait (R4-13a, D-227): one placeholder for the page's Suspense and the route's loading boundary, so a
// navigation shows it once and the record replaces it in place. No inset of its own (R4-10: the stage is the inset).
import { LoadingState } from "@/components/states/LoadingState";

export function ProfileLoading() {
  return <LoadingState shape="plate" label="Reading the record" />;
}
