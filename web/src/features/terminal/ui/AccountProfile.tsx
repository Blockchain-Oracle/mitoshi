"use client";
// The account drawer's profile header (S23 RV-80; S13 step 5 adds the name and its editor): the avatar on the address
// hue, your public name over the address, and "Edit profile" opening the name and bio form in place.
import { useState, type CSSProperties } from "react";
import { addressHue } from "@/lib/address-hue";
import { SOCIAL } from "@/features/social/copy";
import { ProfileEditor } from "@/features/social/ProfileEditor";
import { useProfile } from "@/features/social/useProfile";
import { TERMINAL } from "../copy";

export function AccountProfile({ wallet }: { wallet: string }) {
  const { profile } = useProfile(wallet);
  const [editing, setEditing] = useState(false);
  const short = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="tm-profile">
        <span aria-hidden className="tm-avatar tm-avatar-lg" style={{ "--tm-hue": addressHue(wallet) } as CSSProperties}>{wallet.slice(2, 4).toUpperCase()}</span>
        <span className="tm-pos-main">
          <span className="tm-pos-title">{profile?.displayName ? `@${profile.displayName}` : <span className="tm-mono">{short}</span>}</span>
          <span className="tm-pos-meta">{profile?.displayName ? `${short} · ${TERMINAL.account.chain}` : TERMINAL.account.chain}</span>
        </span>
        <button type="button" className="tm-choice ml-auto" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>{SOCIAL.profile.edit}</button>
      </div>
      {editing ? <ProfileEditor address={wallet} onDone={() => setEditing(false)} /> : null}
    </div>
  );
}
