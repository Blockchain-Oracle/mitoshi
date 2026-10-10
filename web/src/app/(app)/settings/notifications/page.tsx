// `/settings/notifications` (S13 step 7): what this device announces, the browser's permission, and the price alerts.
import { NotificationSettings } from "@/features/notifications/NotificationSettings";

export const metadata = { title: "Notifications" };

export default function SettingsNotificationsPage() {
  return <NotificationSettings />;
}
