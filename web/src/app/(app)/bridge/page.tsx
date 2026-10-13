// /bridge (R4-12, D-227; S14 14w): stocks between Robinhood Chain and Tempo, one card, tracked to delivery.
import { BridgePage } from "@/features/bridge/BridgePage";
import { BRIDGE } from "@/features/bridge/copy";

export const metadata = { title: BRIDGE.title };

export default function Page() {
  return <BridgePage />;
}
