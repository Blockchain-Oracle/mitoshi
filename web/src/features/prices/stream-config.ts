/**
 * Configures the page's one stream connection (`@cwf/markets/stream`) from the public env, once, for whichever island
 * reaches it first (the ticker on every page, the price cache on app pages). Per-user topics get their 60 s ticket
 * from `/api/stream/ticket` (a signed-in session); signed out, there is none and those topics are simply not asked for.
 */
import { configureStream } from "@cwf/markets/stream";
import { webEnv } from "@/lib/env";

export function ensureStream(): boolean {
  const url = webEnv.markets.streamUrl;
  if (!url) return false;
  configureStream({ url, ticket: fetchTicket });
  return true;
}

async function fetchTicket(): Promise<string | null> {
  const res = await fetch("/api/stream/ticket", { method: "POST", credentials: "same-origin" }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { ticket?: string }).ticket ?? null;
}
