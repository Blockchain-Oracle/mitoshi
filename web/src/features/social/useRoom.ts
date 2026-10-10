"use client";
/**
 * A room on the client (S13 step 3): read from `/api/social/rooms/<room>` (anyone), kept live by the stream's `rooms`
 * topic (new messages and reaction counts), and written optimistically — a message shows at once as "sending", becomes
 * the saved one, or stays as "failed" with a retry while the composer keeps the draft (UX fix 10). Writing asks for the
 * one social session first (`useSocialSession().ensure`), so a reader never signs anything.
 */
import { subscribeTopic } from "@cwf/markets/stream";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureStream } from "@/features/prices/stream-config";
import { useSocialSession } from "./session";
import type { ReactionKind } from "./reactions";

export interface RoomMessage {
  id: string;
  room: string;
  author: string;
  name: string | null;
  body: string;
  createdAtMs: number;
  reactions: { counts: Record<string, number>; mine: string[] };
  /** Set only on a message this tab is sending, or failed to send. */
  local?: { state: "sending" | "failed"; error?: string };
}

export type PostOutcome = { ok: true } | { ok: false; message: string };

export function useRoom(room: string | null) {
  const social = useSocialSession();
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [viewer, setViewer] = useState<{ address: string; canPost: boolean | null } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const roomRef = useRef(room);
  roomRef.current = room;

  const load = useCallback(async () => {
    if (!room) return;
    setState("loading");
    const res = await fetch(`/api/social/rooms/${encodeURIComponent(room)}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    if (!res?.ok || roomRef.current !== room) return void (roomRef.current === room && setState("error"));
    const body = (await res.json()) as { messages: RoomMessage[]; viewer: { address: string; canPost: boolean | null } | null };
    setMessages(body.messages.slice().reverse());
    setViewer(body.viewer);
    setState("ready");
  }, [room]);

  useEffect(() => {
    setMessages([]);
    void load();
  }, [load, social.address]);

  // Live: messages anyone posts, and reaction counts as they change (mine stay as this tab last set them).
  useEffect(() => {
    if (!room || !ensureStream()) return;
    return subscribeTopic("rooms", (events) => {
      for (const e of events) {
        if (e.event === "message") {
          const m = e.data as RoomMessage;
          if (m.room !== room) continue;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, reactions: { counts: m.reactions?.counts ?? {}, mine: [] } }]));
        } else if (e.event === "reactions") {
          const r = e.data as { target: string; id: string; counts: Record<string, number> };
          if (r.target !== "comment") continue;
          setMessages((prev) => prev.map((x) => (x.id === r.id ? { ...x, reactions: { counts: r.counts, mine: x.reactions.mine } } : x)));
        }
      }
    });
  }, [room]);

  const send = useCallback(async (body: string, localId: string): Promise<PostOutcome> => {
    const res = await fetch(`/api/social/rooms/${encodeURIComponent(room!)}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { message?: RoomMessage | string }) : {};
    if (res?.ok && typeof json.message === "object") {
      const saved = json.message;
      setMessages((prev) => [...prev.filter((x) => x.id !== localId && x.id !== saved.id), saved]);
      return { ok: true };
    }
    const error = typeof json.message === "string" ? json.message : "That didn't send. Try again.";
    setMessages((prev) => prev.map((x) => (x.id === localId ? { ...x, local: { state: "failed", error } } : x)));
    if (res?.status === 403) setViewer((v) => (v ? { ...v, canPost: false } : v));
    return { ok: false, message: error };
  }, [room]);

  const post = useCallback(async (raw: string): Promise<PostOutcome> => {
    const body = raw.trim();
    if (!room || !body) return { ok: false, message: "Write something first." };
    const session = await social.ensure();
    if (!session.ok) return { ok: false, message: session.reason === "refused" ? "Sign-in was cancelled." : session.reason === "no-wallet" ? "Sign in to post." : (session.message ?? "Sign-in didn't work. Try again.") };
    const localId = `local-${Date.now()}`;
    setMessages((prev) => [...prev, { id: localId, room, author: session.address, name: null, body, createdAtMs: Date.now(), reactions: { counts: {}, mine: [] }, local: { state: "sending" } }]);
    return send(body, localId);
  }, [room, social, send]);

  const retry = useCallback((localId: string) => {
    const m = messages.find((x) => x.id === localId);
    if (!m) return;
    setMessages((prev) => prev.map((x) => (x.id === localId ? { ...x, local: { state: "sending" } } : x)));
    void send(m.body, localId);
  }, [messages, send]);

  const react = useCallback(async (id: string, kind: ReactionKind, on: boolean) => {
    const session = await social.ensure();
    if (!session.ok) return;
    const flip = (x: RoomMessage, onNow: boolean): RoomMessage => ({
      ...x,
      reactions: {
        counts: { ...x.reactions.counts, [kind]: Math.max(0, (x.reactions.counts[kind] ?? 0) + (onNow ? 1 : -1)) },
        mine: onNow ? [...x.reactions.mine, kind] : x.reactions.mine.filter((k) => k !== kind),
      },
    });
    setMessages((prev) => prev.map((x) => (x.id === id ? flip(x, on) : x)));
    const res = await fetch("/api/social/react", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "comment", id, kind, on }) }).catch(() => null);
    if (!res?.ok) setMessages((prev) => prev.map((x) => (x.id === id ? flip(x, !on) : x)));
  }, [social]);

  /** Drops a blocked person's messages from this room at once (the server leaves them out of every later read). */
  const hideAuthor = useCallback((author: string) => setMessages((prev) => prev.filter((x) => x.author !== author.toLowerCase())), []);

  return { messages, viewer, state, reload: load, post, retry, react, hideAuthor, signedIn: social.address };
}
