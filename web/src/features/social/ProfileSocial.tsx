"use client";
// The social half of `/u/<address>` (S13 step 5): name, bio, followers and following, Follow (one sign-in), report and
// block, and the person's takes — the S5 record above it stays server-rendered. R4-2 (D-227): on a phone the Follow row
// sticks above the dock while the section is on screen (`.page-action`) — only when it holds Follow, not on your own page.
import { useState } from "react";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SOCIAL } from "./copy";
import { ReportDialog } from "./report-dialog-lazy";
import { TakeCard } from "./TakesPanel";
import { useProfile } from "./useProfile";
import { useTakes } from "./useTakes";

export function ProfileSocial({ address }: { address: string }) {
  const { profile, follow } = useProfile(address);
  const takes = useTakes({ author: address });
  const [reporting, setReporting] = useState(false);
  const words = SOCIAL.profile;
  const block = async () => {
    const res = await fetch("/api/social/block", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) }).catch(() => null);
    if (res?.ok) notify.item({ id: "profile-block", title: SOCIAL.menu.blocked(profile?.displayName ?? words.thisPerson) });
  };
  return (
    <section className="flex flex-col gap-4" aria-labelledby="profile-social">
      <h2 id="profile-social" className="sr-only">{words.social}</h2>
      {profile?.displayName ? <p className="type-title text-ink">@{profile.displayName}</p> : null}
      {profile?.bio ? <p className="type-body text-ink-secondary">{profile.bio}</p> : null}
      <div className={cn("flex flex-wrap items-center gap-3", profile && !profile.self && "page-action bg-stage py-2")}>
        <span className="type-caption text-ink-secondary">{words.counts(profile?.followers ?? 0, profile?.following ?? 0)}</span>
        {profile && !profile.self ? (
          <>
            <button type="button" aria-pressed={!!profile.viewerFollows} onClick={() => void follow(!profile.viewerFollows).then((e) => e && notify.item({ id: "follow", type: "warning", title: e }))} className={`min-h-touch rounded-full px-4 type-body-strong ${profile.viewerFollows ? "border border-hairline text-ink" : "bg-accent-fill text-on-accent"}`}>
              {profile.viewerFollows ? words.following : words.follow}
            </button>
            <button type="button" className="min-h-touch px-2 type-caption text-ink-secondary underline" onClick={() => setReporting(true)}>{SOCIAL.menu.report}</button>
            <button type="button" className="min-h-touch px-2 type-caption text-ink-secondary underline" onClick={() => void block()}>{SOCIAL.menu.block(profile.displayName ?? words.thisPerson)}</button>
          </>
        ) : null}
      </div>
      <h3 className="type-label-micro text-ink-secondary">{words.takes}</h3>
      {takes.state === "ready" && takes.takes.length === 0 ? <p className="type-caption text-ink-secondary">{words.noTakes}</p> : null}
      <ol className="divide-y divide-hairline">
        {takes.takes.map((t) => (
          <TakeCard key={t.id} t={t} me={takes.signedIn} onReact={(k, on) => void takes.react(t.id, k, on)} onDismiss={() => takes.dismiss(t.id)} onReport={() => undefined} onBlock={() => undefined} />
        ))}
      </ol>
      {reporting ? <ReportDialog open onOpenChange={setReporting} target={{ kind: "profile", id: address }} urlKey="report" /> : null}
    </section>
  );
}
