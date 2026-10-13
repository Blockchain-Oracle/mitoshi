"use client";
// The profile's bar and eyebrow — Ported from Owarine 90a91d71:web/src/features/profile/ProfileScreen.tsx (`prf-bar`)
// with Mitoshi's social actions (R4-10, D-227): the figures on the left (the followers live), the actions on the right —
// Follow (THE action, accent; ghost once followed), Copy this trader (the mirror preset in Create), Copy address,
// Explorer, and a "…" menu for Report and Block (Ported from Owarine 90a91d71:web/src/features/desk/DeskControls.tsx's
// more-menu, on Base UI Menu). Your own profile shows neither Follow nor Copy this trader. On a phone the actions stick
// above the dock while the bar is on screen.
import { Menu } from "@base-ui/react/menu";
import { Check, Copy, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { pillButtonVariants, PillButton } from "@/components/kit/PillButton";
import { ReportDialog } from "@/features/social/report-dialog-lazy";
import { useProfile } from "@/features/social/useProfile";
import { useWalletSession } from "@/lib/wallet-session";
import { notify } from "@/lib/toast";
import { PROFILE as P } from "./copy";
import "@/components/kit/kit.css";

export interface BarStat {
  label: string;
  value: string;
  tone?: "is-up" | "is-down" | "";
}

function useOwn(address: string) {
  const viewer = useWalletSession().address;
  return viewer !== null && viewer.toLowerCase() === address.toLowerCase();
}

export function ProfileEyebrow({ address }: { address: string }) {
  return <span className="news-live-label">{useOwn(address) ? P.eyebrow.own : P.eyebrow.other}</span>;
}

export function ProfileBar({ address, stats, explorerHref }: { address: string; stats: BarStat[]; explorerHref: string }) {
  const { profile, follow } = useProfile(address);
  const own = useOwn(address) || profile?.self === true;
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(address).then(() => setCopied(true), () => undefined);
  const block = async () => {
    const res = await fetch("/api/social/block", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) }).catch(() => null);
    if (res?.ok) notify.item({ id: "profile-block", title: P.blocked });
  };
  return (
    <div className="prf-bar">
      <dl className="prf-stats">
        {stats.map((s) => (
          <div key={s.label} className="prf-stat">
            <dt>{s.label}</dt>
            <dd className={`big numbers ${s.tone ?? ""}`}>{s.value}</dd>
          </div>
        ))}
        <div className="prf-stat">
          <dt>{P.stats.followers}</dt>
          <dd className="big numbers">{profile ? profile.followers.toLocaleString("en-US") : P.dash}</dd>
        </div>
      </dl>
      <div className={own ? "prf-actions" : "prf-actions page-action"}>
        {!own && profile ? (
          <PillButton tone={profile.viewerFollows ? "ghost" : "accent"} size="md" aria-pressed={!!profile.viewerFollows} data-primary-action onClick={() => void follow(!profile.viewerFollows).then((e) => e && notify.item({ id: "follow", type: "warning", title: e }))}>
            {profile.viewerFollows ? P.following : P.follow}
          </PillButton>
        ) : null}
        {!own ? (
          <Link href={`/strategies?view=create&copy=${address}`} className={pillButtonVariants({ tone: "ink", size: "md" })}>
            {P.copyTrader}
          </Link>
        ) : null}
        <PillButton tone="ghost" size="sm" onClick={copy} aria-label={copied ? P.copied : P.copyAddress} title={copied ? P.copied : P.copyAddress}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? P.copied : P.copyAddress}
        </PillButton>
        <a href={explorerHref} target="_blank" rel="noopener noreferrer" className={pillButtonVariants({ tone: "ghost", size: "sm" })}>
          {P.explorer}
        </a>
        {!own ? (
          <Menu.Root modal={false}>
            <Menu.Trigger className="prf-more" aria-label={P.more} title={P.more}>
              <MoreHorizontal aria-hidden className="size-5" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8} align="end" collisionPadding={12} className="am-positioner">
                <Menu.Popup className="am-popup prf-menu">
                  <Menu.Item className="am-item" onClick={() => setReporting(true)}>{P.report}</Menu.Item>
                  <Menu.Item className="am-item" onClick={() => void block()}>{P.block}</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : null}
      </div>
      {reporting ? <ReportDialog open onOpenChange={setReporting} target={{ kind: "profile", id: address }} urlKey="report" /> : null}
    </div>
  );
}
