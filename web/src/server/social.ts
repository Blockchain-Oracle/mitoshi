import "server-only";
/**
 * The social layer's server side (S13): the stores over the app's Postgres, the room ids, the posting limits, the words
 * readers see, and the live push — a write `NOTIFY`s `social`, ops LISTENs and publishes it on the stream's `rooms` /
 * `takes` topics (D-049), so no new endpoint or secret sits between web and ops.
 */
import { isTickerSymbol, type TickerSymbol } from "@cwf/core";
import { createPgSocialModeration, createPgSocialPeople, createPgSocialPosts, type Profile, type ReactionSummary, type RoomComment } from "@cwf/db";
import { db } from "./db";
import { clean } from "./word-filter";

export const people = () => createPgSocialPeople(db());
export const posts = () => createPgSocialPosts(db());
export const moderation = () => createPgSocialModeration(db());

/** A room: a Window (`0x` + 64 hex, its market id) or a ticker (`$TSLA`). */
export type Room = { kind: "window"; id: string } | { kind: "ticker"; id: string; symbol: TickerSymbol };

export function parseRoom(raw: string): Room | null {
  const r = decodeURIComponent(raw);
  if (/^0x[0-9a-fA-F]{64}$/.test(r)) return { kind: "window", id: r.toLowerCase() };
  const sym = r.startsWith("$") ? r.slice(1).toUpperCase() : null;
  return sym && isTickerSymbol(sym) ? { kind: "ticker", id: `$${sym}`, symbol: sym } : null;
}

/** Agari's posting limits per address, per process: one every 3 s, twenty in any 10 minutes. */
const recent = new Map<string, number[]>();
export function postAllowed(address: string, nowMs: number, limits = { gapMs: 3_000, max: 20, windowMs: 600_000 }): { ok: true } | { ok: false; retryAfterSec: number } {
  const list = (recent.get(address) ?? []).filter((t) => nowMs - t < limits.windowMs);
  const last = list.at(-1);
  if (last !== undefined && nowMs - last < limits.gapMs) return { ok: false, retryAfterSec: Math.ceil((limits.gapMs - (nowMs - last)) / 1000) };
  if (list.length >= limits.max) return { ok: false, retryAfterSec: Math.ceil((limits.windowMs - (nowMs - list[0]!)) / 1000) };
  list.push(nowMs);
  recent.set(address, list);
  return { ok: true };
}

/** A room message as every reader gets it: the words starred, the author's public name, the reactions. */
export interface MessageView {
  id: string;
  room: string;
  author: string;
  name: string | null;
  body: string;
  createdAtMs: number;
  reactions: ReactionSummary;
}

export function messageView(m: RoomComment, profiles: Map<string, Profile>, reactions: Map<string, ReactionSummary>): MessageView {
  return { id: m.id, room: m.room, author: m.author, name: profiles.get(m.author)?.displayName ?? null, body: clean(m.body), createdAtMs: m.createdAtMs, reactions: reactions.get(m.id) ?? { counts: {}, mine: [] } };
}

/** The live push: ops relays `social` notifications onto the stream topic named in the payload. */
export async function announce(topic: "rooms" | "takes", event: string, data: unknown): Promise<void> {
  await db().notify("social", JSON.stringify({ topic, event, data })).catch(() => undefined);
}
