// `/settings/notifications` (S13 step 7): what this device announces, the browser's permission, and the price alerts.
import { NotificationsIsland } from "@/features/notifications/NotificationsIsland";

export const metadata = { title: "Notifications" };

export default function SettingsNotificationsPage() {
  return <NotificationsIsland />;
}
