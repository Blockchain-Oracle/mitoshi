// The group's loading boundary (D-050): every navigation into it shows the shell at once and names the wait.
import { LoadingState } from "@/components/states/LoadingState";

export default function Loading() {
  return <LoadingState shape="page" className="container py-10" />;
}
