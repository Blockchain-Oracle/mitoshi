"use client";
// `/activity` — the inbox. Ported from Owarine 90a91d71:web/src/features/activity/ActivityScreen.tsx (R4-10, D-227) in
// /news's frame: a freshness stamp, the head, the JP line; then the Inbox bar with the browser-notifications control and
// Settings, and the wallet's last seven days as numbered wire rows (its marble in the mark slot, the kind as the tone
// word, how long ago). Opening it marks everything seen (the rail's badge clears); the store and its poll are S13's.
// R6 money (T10, D-230): no wall signed out — "Activity" with one inline "Sign in to see yours", then the public
// settlement feed in the same rows (`JustSettled`). The eyebrow says how old the data is ("Updated 12 s ago", from the
// last read that answered), never a claim of live; the inbox waits as rows, never "Reading your week…".
import Link from "next/link";
import { useEffect, useState } from "react";
import { pillButtonVariants, PillButton } from "@/components/kit/PillButton";
import { Pill } from "@/components/kit/Pill";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { StateFrame } from "@/components/states/EmptyState";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { table as tableShape } from "@/components/states/shapes/pages";
import { notificationState, requestNotificationPermission, type NotificationState } from "@/features/alerts/notifications";
import { timeAgo } from "@/features/news/copy";
import { NewsRow } from "@/features/news/NewsRow";
import type { Sentiment } from "@/features/news/wire";
import { useClockValue } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { NOTICES } from "./copy";
import { Freshness } from "./Freshness";
import { JustSettled } from "./JustSettled";
import type { PublicFeed } from "./public-feed.server";
import { markSeen, refreshNotices, useNotices, type Notice } from "./store";
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

/** `feed`: the public settlement feed (undefined while it streams in, null when the index can't be read). */
export function NotificationCentre({ feed }: { feed?: PublicFeed | null }) {
  const { address, connectFor } = useWalletSession();
  const s = useNotices();
  const nowMs = useClockValue((ms) => Math.floor(ms / 60_000) * 60_000);
  useEffect(() => {
    if (s.read && address) markSeen();
  }, [s.read, s.items.length, address]);
  const freshAt = address ? s.atMs : (feed?.readAtMs ?? null);
  return (
    <div className="container news-page">
      <div className="news-inner">
        <Freshness atMs={freshAt} />
        {address ? (
          <h1 className="news-title">
            {NOTICES.heading} <span className="signal">{NOTICES.headingAccent}</span>
          </h1>
        ) : (
          <h1 className="news-title">{NOTICES.title}</h1>
        )}
        <div className="page-title-jp" lang="ja">{NOTICES.headingJp}</div>

        {!address ? (
          <>
            <div className="act-signin">
              <Pill tone="accent" size="md" data-primary-action="" onClick={() => connectFor(NOTICES.signInIntent)}>{NOTICES.signIn}</Pill>
            </div>
            {feed === undefined ? (
              <section className="act-section"><LoadingFrame shape="table" label={NOTICES.settled.title}>{tableShape()}</LoadingFrame></section>
            ) : (
              <JustSettled feed={feed} />
            )}
          </>
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
              <LoadingFrame shape="table" label={NOTICES.inbox} className="act-list">{tableShape()}</LoadingFrame>
            ) : s.error && s.items.length === 0 ? (
              <StateFrame size="inline" tone="warning" role="alert" title={NOTICES.error} className="act-state" actions={<Pill tone="ink" size="sm" onClick={() => void refreshNotices()}>{NOTICES.settled.retry}</Pill>} />
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
