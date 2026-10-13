"use client";
// `/activity` — the signed-in inbox. Ported from Owarine 90a91d71:web/src/features/activity/ActivityScreen.tsx (R4-10,
// D-227) in /news's frame: the live eyebrow, "Your Activity", the JP line, one line; then the Inbox bar with the
// browser-notifications control and Settings, and the wallet's last seven days as numbered wire rows (its marble in the
// mark slot, the kind as the tone word, how long ago). Signed out, the action is Sign in. Opening it marks everything
// seen (the rail's badge clears); the store and its poll are S13's.
import Link from "next/link";
import { useEffect, useState } from "react";
import { pillButtonVariants, PillButton } from "@/components/kit/PillButton";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { notificationState, requestNotificationPermission, type NotificationState } from "@/features/alerts/notifications";
import { timeAgo } from "@/features/news/copy";
import { NewsRow } from "@/features/news/NewsRow";
import type { Sentiment } from "@/features/news/wire";
import { useClockValue } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { NOTICES } from "./copy";
import { markSeen, useNotices, type Notice } from "./store";
import "@/styles/news.css";
import "@/styles/news-wire.css";
import "@/styles/activity.css";
import "@/components/kit/kit.css";

/** The face in the mark slot: the follower's for a follow, the author's for a take, yours for your own calls. */
const seedOf = (n: Notice, me: string) => n.actor ?? (n.href?.startsWith("/u/") ? n.href.slice(3) : me);
const TONE: Record<Notice["kind"], Sentiment> = { filled: "neutral", won: "positive", lost: "negative", void: "neutral", follower: "neutral", take: "neutral" };

/** Whether this device announces lifecycle events; a toast shows in the tab either way. */
function NotificationsControl() {
  const [state, setState] = useState<NotificationState>("unsupported");
  useEffect(() => setState(notificationState()), []);
  const words = NOTICES.notifications;
  if (state === "unsupported") return null;
  if (state !== "default") return <span className="act-meta">{state === "granted" ? words.on : words.blocked}</span>;
  return (
    <PillButton tone="ghost" size="sm" onClick={() => void requestNotificationPermission().then(() => setState(notificationState()))}>
      {words.enable}
    </PillButton>
  );
}

export function NotificationCentre() {
  const { address, connect } = useWalletSession();
  const s = useNotices();
  const nowMs = useClockValue((ms) => Math.floor(ms / 60_000) * 60_000);
  useEffect(() => {
    if (s.read && address) markSeen();
  }, [s.read, s.items.length, address]);
  return (
    <div className="container news-page">
      <div className="news-inner">
        <div className="news-live">
          <span className="news-live-dot" aria-hidden />
          <span className="news-live-label">{NOTICES.live}</span>
        </div>
        <h1 className="news-title">
          {NOTICES.heading} <span className="signal">{NOTICES.headingAccent}</span>
        </h1>
        <div className="page-title-jp" lang="ja">{NOTICES.headingJp}</div>
        <p className="news-intro">{NOTICES.lead}</p>

        {!address ? (
          <div className="act-connect">
            <p className="act-connect-title">{NOTICES.signedOut}</p>
            <PillButton tone="accent" size="md" onClick={connect} data-primary-action>{NOTICES.signIn}</PillButton>
          </div>
        ) : (
          <>
            <div className="act-tabs">
              <span className="act-tab">{NOTICES.inbox}</span>
              <span className="act-controls">
                <NotificationsControl />
                <Link href="/settings/notifications" className="act-link">{NOTICES.settings}</Link>
              </span>
            </div>
            {!s.read ? (
              <p role="status" className="act-quiet">{NOTICES.loading}</p>
            ) : s.error && s.items.length === 0 ? (
              <p role="alert" className="act-quiet">{NOTICES.error}</p>
            ) : s.items.length === 0 ? (
              <div className="act-connect">
                <p className="act-quiet">{NOTICES.empty}</p>
                <Link href="/trade" className={pillButtonVariants({ tone: "accent", size: "md" })}>{NOTICES.trade}</Link>
              </div>
            ) : (
              <ol className="news-wire act-list">
                {s.items.map((n, i) => (
                  <NewsRow
                    key={n.id}
                    index={i + 1}
                    title={n.title}
                    href={n.href ?? null}
                    external={false}
                    kind={n.kind}
                    mark={<AccountAvatar seed={seedOf(n, address)} size={16} />}
                    meta={<span className="news-meta">{nowMs > 0 ? timeAgo(n.atSec, nowMs) : ""}</span>}
                    tone={TONE[n.kind]}
                    toneWord={NOTICES.word[n.kind]}
                  />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}
