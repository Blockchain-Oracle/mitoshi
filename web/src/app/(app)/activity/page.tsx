// `/activity` — the inbox (S13 step 6, filed under Portfolio with the rail's badge); Owarine 90a91d71's ActivityScreen
// frame since R4-10 (D-227).
import { NotificationCentre } from "@/features/notifications/NotificationCentre";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  return <NotificationCentre />;
}
