"use client";
// Your public name and bio (S13 step 5; Tradash's profile edit: a 3–20 letter/digit/underscore name). The avatar stays
// the address's initials on its hue: nothing about a person is uploaded.
import { useEffect, useState } from "react";
import { notify } from "@/lib/toast";
import { SOCIAL } from "./copy";
import { useProfile } from "./useProfile";

export function ProfileEditor({ address, onDone }: { address: string; onDone?: () => void }) {
  const { profile, save } = useProfile(address);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const words = SOCIAL.profile;
  useEffect(() => {
    if (!profile) return;
    setName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
  }, [profile]);
  const submit = async () => {
    setBusy(true);
    const error = await save({ displayName: name, bio });
    setBusy(false);
    notify.item({ id: "profile-save", ...(error ? { type: "warning" as const, title: error } : { title: words.saved }) });
    if (!error) onDone?.();
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), void submit())}>
      <label className="flex flex-col gap-1">
        <span className="type-caption text-ink-secondary">{words.name}</span>
        <input value={name} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20))} autoComplete="nickname" className="min-h-touch rounded-md border border-hairline bg-surface-1 px-3 text-base text-ink" />
        <span className="type-caption text-ink-secondary">{words.nameHint}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="type-caption text-ink-secondary">{words.bio}</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} rows={3} className="resize-none rounded-md border border-hairline bg-surface-1 p-2 text-base text-ink" />
        <span className="self-end type-caption tabular-nums text-ink-secondary">{bio.length} / 160</span>
      </label>
      <button type="submit" disabled={busy || (name.length > 0 && name.length < 3)} className="min-h-touch rounded-full bg-accent-fill px-4 type-body-strong text-on-accent disabled:opacity-50">{words.save}</button>
    </form>
  );
}
