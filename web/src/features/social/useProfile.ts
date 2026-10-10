"use client";
/** A person's social profile on the client (S13 step 5): read, followed or unfollowed, and — your own — edited. */
import { useCallback, useEffect, useState } from "react";
import { useSocialSession } from "./session";

export interface SocialProfile {
  address: string;
  displayName: string | null;
  bio: string | null;
  followers: number;
  following: number;
  viewerFollows: boolean | null;
  self: boolean;
}

export function useProfile(address: string) {
  const social = useSocialSession();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    const res = await fetch(`/api/social/profile?address=${address}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    if (!res?.ok) return void setState("error");
    setProfile((await res.json()) as SocialProfile);
    setState("ready");
  }, [address]);
  useEffect(() => void load(), [load, social.address]);

  const follow = useCallback(async (on: boolean): Promise<string | null> => {
    const s = await social.ensure();
    if (!s.ok) return s.reason === "refused" ? "Sign-in was cancelled." : "Sign in to follow.";
    setProfile((p) => (p ? { ...p, viewerFollows: on, followers: Math.max(0, p.followers + (on ? 1 : -1)) } : p));
    const res = await fetch("/api/social/follow", { method: on ? "POST" : "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) }).catch(() => null);
    if (!res?.ok) {
      setProfile((p) => (p ? { ...p, viewerFollows: !on, followers: Math.max(0, p.followers + (on ? -1 : 1)) } : p));
      return "That didn't save. Try again.";
    }
    return null;
  }, [address, social]);

  const save = useCallback(async (next: { displayName: string; bio: string }): Promise<string | null> => {
    const s = await social.ensure();
    if (!s.ok) return "Sign in to edit your profile.";
    const res = await fetch("/api/social/profile", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { message?: string; displayName?: string | null; bio?: string | null }) : {};
    if (!res?.ok) return json.message ?? "That didn't save. Try again.";
    setProfile((p) => (p ? { ...p, displayName: json.displayName ?? null, bio: json.bio ?? null } : p));
    return null;
  }, [social]);

  return { profile, state, follow, save, reload: load };
}
