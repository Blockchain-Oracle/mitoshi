// The group's loading boundary (D-050): every navigation into it shows the shell at once and names the wait.
import { LoadingState } from "@/components/states/LoadingState";

export default function Loading() {
  return <LoadingState shape="plate" className="px-gutter py-6 lg:px-gutter-desktop" />;
}
