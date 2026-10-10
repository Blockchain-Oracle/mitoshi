"use client";
// `/settings/notifications` (S13 step 7; plan: topics grouped Money moved / Social / Games, money on by default): the
// browser's permission, the topics this device announces (FeedbackSection's switch rows), and every price alert kept on
// this device with a remove each. The app's push (SM2) keeps its own copy of the topics server-side.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { AlertList } from "@/features/alerts/PriceAlertsPanel";
import { notificationState, requestNotificationPermission, type NotificationState } from "@/features/alerts/notifications";
import { loadAlerts, subscribeAlerts, type PriceAlert } from "@/features/alerts/store";
import { NOTICE_SETTINGS as S } from "./copy";
import { setNoticeTopics, useNoticeTopics, type NoticeTopics } from "./topics";

export function NotificationSettings() {
  const topics = useNoticeTopics();
  const [perm, setPerm] = useState<NotificationState | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  useEffect(() => {
    setPerm(notificationState());
    const sync = () => setAlerts(loadAlerts());
    sync();
    return subscribeAlerts(sync);
  }, []);
  return (
    <div className="mx-auto flex w-full max-w-(--content-reading) flex-col gap-8 px-gutter py-10 lg:px-gutter-desktop">
      <header className="flex flex-col gap-2">
        <h1 className="type-display text-ink">{S.title}</h1>
        <p className="type-body text-ink-secondary">{S.lead} <Link href="/activity" className="underline">{S.activity}</Link></p>
      </header>
      <section aria-labelledby="browser-title" className="flex flex-col items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
        <h2 id="browser-title" className="type-title text-ink">{S.browser.title}</h2>
        {perm ? <p role="status" className="type-body text-ink-secondary">{S.browser[perm]}</p> : null}
        {perm === "default" ? (
          <button type="button" className="min-h-touch rounded-full bg-accent-fill px-4 type-body-strong text-on-accent" onClick={() => void requestNotificationPermission().then(() => setPerm(notificationState()))}>{S.browser.allow}</button>
        ) : null}
      </section>
      <section aria-labelledby="topics-title" className="flex flex-col gap-2">
        <h2 id="topics-title" className="type-title text-ink">{S.topics.title}</h2>
        <ul className="flex flex-col divide-y divide-hairline">
          {S.topics.rows.map((row) => {
            const key = row.key as keyof NoticeTopics;
            return (
              <li key={row.key}>
                <label className="flex min-h-touch cursor-pointer items-center justify-between gap-4 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="type-body-strong text-ink">{row.label}</span>
                    <span className="type-caption text-ink-secondary">{row.hint}</span>
                  </span>
                  <Switch aria-label={row.label} checked={topics[key]} onCheckedChange={(on) => setNoticeTopics({ [key]: on })} />
                </label>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="alerts-title" className="flex flex-col gap-2">
        <h2 id="alerts-title" className="type-title text-ink">{S.alerts.title}</h2>
        {alerts.length === 0 ? (
          <p className="type-body text-ink-secondary">{S.alerts.empty} <Link href="/trade" className="underline">{S.alerts.open}</Link></p>
        ) : <AlertList alerts={alerts} withAsset />}
      </section>
    </div>
  );
}
