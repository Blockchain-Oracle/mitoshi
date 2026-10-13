"use client";
// The profile's ident row and eyebrow — Ported from Owarine 90a91d71:web/src/features/profile/ProfileScreen.tsx (`prf-bar`)
// with Mitoshi's social actions (R4-10, D-227). R6 money (S20, D-230): one row — the marble, the name and "12 followers"
// under it on the left; on the right the one pair, Follow (accent; ghost once followed) and Copy this trader (ink), then
// "…" holding Copy address, Explorer, Report and Block (Ported from Owarine 90a91d71:web/src/features/desk/
// DeskControls.tsx's more-menu, on Base UI Menu). Your own profile shows only "…". On a phone the pair sticks above the
// dock while the row is on screen (`page-action`).
import { MoreHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { pillButtonVariants, PillButton } from "@/components/kit/PillButton";
import { ReportDialog } from "@/features/social/report-dialog-lazy";
import { useProfile } from "@/features/social/useProfile";
import { useWalletSession } from "@/lib/wallet-session";
import { notify } from "@/lib/toast";
import { PROFILE as P } from "./copy";
import "@/components/kit/kit.css";

/** The "…" menu loads after first paint; its trigger's shape holds the place. */
const More = dynamic(() => import("./ProfileMore").then((m) => m.ProfileMore), {
  ssr: false,
  loading: () => (
    <span className="prf-more" aria-hidden>
      <MoreHorizontal className="size-5" />
    </span>
  ),
});

function useOwn(address: string) {
  const viewer = useWalletSession().address;
  return viewer !== null && viewer.toLowerCase() === address.toLowerCase();
}

export function ProfileEyebrow({ address }: { address: string }) {
  return <span className="news-live-label">{useOwn(address) ? P.eyebrow.own : P.eyebrow.other}</span>;
}

/** `ident`: the marble and the name (server-drawn); the followers line and the actions are live here. */
export function ProfileBar({ address, ident, explorerHref }: { address: string; ident: ReactNode; explorerHref: string }) {
  const { profile, follow } = useProfile(address);
  const own = useOwn(address) || profile?.self === true;
  const [reporting, setReporting] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(address).then(() => notify.item({ id: "profile-copy", title: P.copied }), () => undefined);
  const block = async () => {
    const res = await fetch("/api/social/block", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) }).catch(() => null);
    if (res?.ok) notify.item({ id: "profile-block", title: P.blocked });
  };
  return (
    <div className="prf-bar">
      <div className="prf-ident">
        {ident}
        <span className="prf-followers numbers">{profile ? P.followers(profile.followers) : P.dash}</span>
      </div>
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
        <More own={own} explorerHref={explorerHref} onCopy={copy} onReport={() => setReporting(true)} onBlock={() => void block()} />
      </div>
      {reporting ? <ReportDialog open onOpenChange={setReporting} target={{ kind: "profile", id: address }} urlKey="report" /> : null}
    </div>
  );
}
