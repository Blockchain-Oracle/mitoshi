"use client";
// `/settings/notifications` (S13 step 7) as one grouped list (R4-11, D-227; Owarine 90a91d71 AccountSheet's settings
// grammar and features/alerts/PriceAlertsButton.tsx's alert rows): the title with "Activity →" beside it; BROWSER, one row
// with its state and an Allow pill while the browser hasn't been asked; ANNOUNCE, four toggles on this device's topics;
// PRICE ALERTS, a coloured ↑/↓, the asset, the target and ✕ per alert, kept on this device. One foot line says where
// alerts fire. The app's push (SM2) keeps its own copy of the topics server-side.
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { GroupedList, GroupedToggle, PillButton } from "@/components/kit";
import { notificationState, requestNotificationPermission, type NotificationState } from "@/features/alerts/notifications";
import { ALERTS } from "@/features/alerts/copy";
import { loadAlerts, removeAlert, subscribeAlerts, type PriceAlert } from "@/features/alerts/store";
import { NOTICE_SETTINGS as S } from "./copy";
import { setNoticeTopics, useNoticeTopics, type NoticeTopics } from "./topics";
import "@/styles/account.css";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    <section className="acct-page">
      <div className="acct-head">
        <h1 className="type-display text-ink">{S.title}</h1>
        <Link href="/activity" className="acct-head-link">{S.activity}</Link>
      </div>
      <GroupedList title={S.browser.title}>
        <div className="kit-item">
          <span className="kit-item-label">{S.browser.row}</span>
          <span role="status" className="kit-item-detail">{perm ? S.browser[perm] : "—"}</span>
          {perm === "default" ? <PillButton tone="accent" size="sm" onClick={() => void requestNotificationPermission().then(() => setPerm(notificationState()))}>{S.browser.allow}</PillButton> : null}
        </div>
      </GroupedList>
      <GroupedList title={S.topics.title}>
        {S.topics.rows.map((row) => {
          const key = row.key as keyof NoticeTopics;
          return <GroupedToggle key={row.key} label={row.label} checked={topics[key]} onChange={(on) => setNoticeTopics({ [key]: on })} />;
        })}
      </GroupedList>
      <GroupedList title={S.alerts.title}>
        {alerts.length === 0 ? (
          <Link href="/trade" className="kit-item">
            <span className="kit-item-label kit-item-detail">{S.alerts.empty}</span>
          </Link>
        ) : (
          alerts.map((a) => {
            const line = ALERTS.line(a.direction, usd(a.targetCents));
            return (
              <div key={a.id} className="nt-alert">
                <span aria-hidden className="nt-alert-dir" data-dir={a.direction}>{a.direction === "above" ? "↑" : "↓"}</span>
                <span className="nt-alert-asset">{a.asset}</span>
                <span className="nt-alert-price">{usd(a.targetCents)}</span>
                {a.triggered ? <span className="nt-alert-fired">{ALERTS.done}</span> : null}
                <button type="button" className="nt-alert-x" aria-label={ALERTS.remove(`${a.asset} ${line}`)} title={ALERTS.remove(`${a.asset} ${line}`)} onClick={() => removeAlert(a.id)}>
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            );
          })
        )}
      </GroupedList>
      <p className="nt-alert-foot">{S.alerts.foot}</p>
    </section>
  );
}
