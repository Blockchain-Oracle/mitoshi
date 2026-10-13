// `/u/<address>`'s wait (R4-13a, D-227): one placeholder for the page's Suspense and the route's loading boundary, so a
// navigation shows it once and the record replaces it in place.
import { LoadingState } from "@/components/states/LoadingState";

export function ProfileLoading() {
  return <LoadingState shape="plate" className="px-gutter py-10 lg:px-gutter-desktop" label="Reading the record" />;
}
