// `/activity` — the notification centre (S13 step 6, filed under Portfolio with the rail's badge).
import { NotificationCentre } from "@/features/notifications/NotificationCentre";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  return <NotificationCentre />;
}
