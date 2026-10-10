"use client";
/**
 * Takes on the client (S13 step 4): a ticker's feed from `/api/social/takes?symbol=`, kept live by the stream's `takes`
 * topic, and posted optimistically against the Window on screen — the take shows at once, becomes the saved one, or is
 * marked failed while the composer keeps the caption. Posting asks for the one social session first.
 */
import { subscribeTopic } from "@cwf/markets/stream";
import { useCallback, useEffect, useState } from "react";
import { ensureStream } from "@/features/prices/stream-config";
import { useSocialSession } from "./session";
import type { ReactionKind } from "./reactions";

export interface Take {
  id: string;
  marketId: string;
  author: string;
  name: string | null;
  side: "up" | "down";
  caption: string;
  asset: string;
  intervalSec: number;
  expirySec: number;
  lineRaw: string | null;
  backed: boolean;
  createdAtMs: number;
  tags: string[];
  reactions: { counts: Record<string, number>; mine: string[] };
  local?: { state: "sending" | "failed"; error?: string };
}

export function useTakes(symbol: string) {
  const social = useSocialSession();
  const [takes, setTakes] = useState<Take[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    const res = await fetch(`/api/social/takes?symbol=${encodeURIComponent(symbol)}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    if (!res?.ok) return void setState("error");
    setTakes(((await res.json()) as { takes: Take[] }).takes);
    setState("ready");
  }, [symbol]);

  useEffect(() => void load(), [load, social.address]);

  useEffect(() => {
    if (!ensureStream()) return;
    return subscribeTopic("takes", (events) => {
      for (const e of events) {
        if (e.event === "take") {
          const t = e.data as Take;
          if (t.asset !== symbol && !t.tags.includes(symbol)) continue;
          setTakes((prev) => (prev.some((x) => x.id === t.id) ? prev : [{ ...t, reactions: { counts: t.reactions?.counts ?? {}, mine: [] } }, ...prev]));
        } else if (e.event === "reactions") {
          const r = e.data as { target: string; id: string; counts: Record<string, number> };
          if (r.target !== "take") continue;
          setTakes((prev) => prev.map((x) => (x.id === r.id ? { ...x, reactions: { counts: r.counts, mine: x.reactions.mine } } : x)));
        }
      }
    });
  }, [symbol]);

  const post = useCallback(async (input: { marketId: string; side: "up" | "down"; caption: string; window: Pick<Take, "asset" | "intervalSec" | "expirySec"> }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const session = await social.ensure();
    if (!session.ok) return { ok: false, message: session.reason === "refused" ? "Sign-in was cancelled." : session.reason === "no-wallet" ? "Sign in to post a take." : (session.message ?? "Sign-in didn't work. Try again.") };
    const localId = `local-${Date.now()}`;
    const draft: Take = { id: localId, marketId: input.marketId, author: session.address, name: null, side: input.side, caption: input.caption.trim(), ...input.window, lineRaw: null, backed: false, createdAtMs: Date.now(), tags: [input.window.asset], reactions: { counts: {}, mine: [] }, local: { state: "sending" } };
    setTakes((prev) => [draft, ...prev]);
    const res = await fetch("/api/social/takes", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: input.marketId, side: input.side, caption: input.caption }) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { take?: Take; message?: string }) : {};
    if (res?.ok && json.take) {
      const saved = json.take;
      setTakes((prev) => [saved, ...prev.filter((x) => x.id !== localId && x.id !== saved.id)]);
      return { ok: true };
    }
    const error = json.message ?? "That take didn't post. Try again.";
    setTakes((prev) => prev.map((x) => (x.id === localId ? { ...x, local: { state: "failed", error } } : x)));
    return { ok: false, message: error };
  }, [social]);

  const dismiss = useCallback((localId: string) => setTakes((prev) => prev.filter((x) => x.id !== localId)), []);

  const react = useCallback(async (id: string, kind: ReactionKind, on: boolean) => {
    const session = await social.ensure();
    if (!session.ok) return;
    const flip = (x: Take, onNow: boolean): Take => ({ ...x, reactions: { counts: { ...x.reactions.counts, [kind]: Math.max(0, (x.reactions.counts[kind] ?? 0) + (onNow ? 1 : -1)) }, mine: onNow ? [...x.reactions.mine, kind] : x.reactions.mine.filter((k) => k !== kind) } });
    setTakes((prev) => prev.map((x) => (x.id === id ? flip(x, on) : x)));
    const res = await fetch("/api/social/react", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "take", id, kind, on }) }).catch(() => null);
    if (!res?.ok) setTakes((prev) => prev.map((x) => (x.id === id ? flip(x, !on) : x)));
  }, [social]);

  const hideAuthor = useCallback((author: string) => setTakes((prev) => prev.filter((x) => x.author !== author.toLowerCase())), []);

  return { takes, state, reload: load, post, dismiss, react, hideAuthor, signedIn: social.address };
}
