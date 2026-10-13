// `/launch` (S17; R4-11, D-227): every launch the registry records, read client-side from the chain.
import { LaunchScreen } from "@/features/launch/LaunchScreen";

export const metadata = { title: "Launch", description: "Launch a coin in one confirmation." };

export default function LaunchPage() {
  return <LaunchScreen />;
}
