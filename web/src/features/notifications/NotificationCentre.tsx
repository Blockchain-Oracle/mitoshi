"use client";
// `/activity` — the notification centre (S13 step 6, filed under Portfolio; Agari 03b30ab `ActivityScreen` +
// `ActivityList` in purpose, 21st 28490's grouped list): the wallet's last seven days, newest first, grouped by day —
// calls filled, settled your way or against you, voided; new followers; takes by people you follow. Opening it marks
// everything seen (the rail's badge clears).
import Link from "next/link";
import { Ban, CheckCircle2, CircleDot, MessageSquareQuote, UserPlus, XCircle } from "lucide-react";
import { useEffect } from "react";
import { useWalletSession } from "@/lib/wallet-session";
import { NOTICES } from "./copy";
import { markSeen, useNotices, type Notice } from "./store";

const ICON: Record<Notice["kind"], typeof CircleDot> = { filled: CircleDot, won: CheckCircle2, lost: XCircle, void: Ban, follower: UserPlus, take: MessageSquareQuote };
const TONE: Record<Notice["kind"], string> = { filled: "text-ink-secondary", won: "text-profit", lost: "text-loss", void: "text-ink-secondary", follower: "text-accent", take: "text-accent" };
const day = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function NotificationCentre() {
  const { address, connect } = useWalletSession();
  const s = useNotices();
  useEffect(() => {
    if (s.read && address) markSeen();
  }, [s.read, s.items.length, address]);
  const groups = new Map<string, Notice[]>();
  for (const n of s.items) groups.set(day(n.atSec), [...(groups.get(day(n.atSec)) ?? []), n]);
  return (
    <div className="mx-auto flex w-full max-w-(--content-reading) flex-col gap-6 px-gutter py-10 lg:px-gutter-desktop">
      <header className="flex flex-col gap-2">
        <h1 className="type-display text-ink">{NOTICES.title}</h1>
        <p className="type-body text-ink-secondary">{NOTICES.lead}</p>
      </header>
      {!address ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
          <p className="type-body text-ink-secondary">{NOTICES.signedOut}</p>
          <button type="button" onClick={connect} className="min-h-touch rounded-full bg-accent-fill px-4 type-body-strong text-on-accent">{NOTICES.signIn}</button>
        </div>
      ) : !s.read ? (
        <p role="status" className="type-body text-ink-secondary">{NOTICES.loading}</p>
      ) : s.error && s.items.length === 0 ? (
        <p role="alert" className="type-body text-ink-secondary">{NOTICES.error}</p>
      ) : s.items.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink-secondary">{NOTICES.empty} <Link href="/trade" className="underline">{NOTICES.trade}</Link></p>
      ) : (
        [...groups].map(([label, items]) => (
          <section key={label} aria-label={label} className="flex flex-col gap-2">
            <h2 className="type-label-micro text-ink-secondary">{label}</h2>
            <ol className="divide-y divide-hairline rounded-lg border border-hairline bg-surface-1">
              {items.map((n) => {
                const Icon = ICON[n.kind];
                const row = (
                  <>
                    <Icon aria-hidden className={`mt-0.5 size-5 flex-none ${TONE[n.kind]}`} />
                    <span className="min-w-0 flex-1 type-body text-ink">{n.title}</span>
                    <span className="type-caption tabular-nums text-ink-secondary">{time(n.atSec)}</span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.href ? <Link href={n.href} className="flex min-h-touch items-start gap-3 px-4 py-3 hover:bg-surface-2">{row}</Link> : <div className="flex min-h-touch items-start gap-3 px-4 py-3">{row}</div>}
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
