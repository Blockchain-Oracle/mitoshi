/**
 * System notifications (ported from Agari 03b30ab:web/src/features/alerts/notifications.ts; Masayume `store.ts:125-150`):
 * the browser's own notification when permitted; every caller pairs it with an in-app toast.
 */
export type NotificationState = "unsupported" | "granted" | "denied" | "default";

export function notificationState(): NotificationState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (notificationState() === "unsupported") return false;
  if (Notification.permission === "granted") return true;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** A system notification when permitted; the caller pairs it with an in-app toast either way. */
export function sendNotification(title: string, body: string): void {
  if (notificationState() !== "granted") return;
  try {
    new Notification(title, { body, icon: "/icon.svg" });
  } catch {
    // some embedded browsers expose the API and then refuse the constructor
  }
}
