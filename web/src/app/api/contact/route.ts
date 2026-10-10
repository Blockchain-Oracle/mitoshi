// `/api/contact` (S13 step 10; D34, App Review 1.2): the published contact. `/contact` posts a plain form here (no
// JavaScript needed) and is sent back with the outcome in its address. Stored for ops' queue (`moderate.ts contact`);
// the sender's address only when signed in, an email only when they ask for a reply. A hidden field catches bots; an
// address may send one message per 30 s and five an hour.
import { CONTACT_TOPICS, createPgContact, type ContactTopic } from "@cwf/db";
import { clientIp } from "@/features/sensei/rate.server";
import { db } from "@/server/db";
import { callerSession } from "@/server/session";

const GAP_MS = 30_000;
const PER_HOUR = 5;
const HOUR_MS = 3_600_000;
const sent = new Map<string, number[]>();

function allowed(ip: string, nowMs: number): boolean {
  const recent = (sent.get(ip) ?? []).filter((t) => nowMs - t < HOUR_MS);
  if (recent.length >= PER_HOUR || (recent.length > 0 && nowMs - recent.at(-1)! < GAP_MS)) return false;
  sent.set(ip, [...recent, nowMs]);
  if (sent.size > 5_000) for (const [k, v] of sent) if (nowMs - (v.at(-1) ?? 0) >= HOUR_MS) sent.delete(k);
  return true;
}

// A relative Location: behind the proxy `req.url` can carry the container's own host.
const back = (_req: Request, outcome: string) => new Response(null, { status: 303, headers: { location: `/contact?${outcome}`, "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  if (!form) return back(req, "error=unreadable");
  const field = (k: string) => String(form.get(k) ?? "").trim();
  // The hidden field: people never see it, so anything in it is a bot. It is told it was sent.
  if (field("website")) return back(req, "sent=1");
  const topic = field("topic") as ContactTopic;
  const body = field("message").slice(0, 2_000);
  const email = field("email").slice(0, 200) || null;
  if (!CONTACT_TOPICS.includes(topic)) return back(req, "error=topic");
  if (!body) return back(req, "error=empty");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back(req, "error=email");
  if (!allowed(clientIp(req), Date.now())) return back(req, "error=wait");
  const session = await callerSession(req).catch(() => null);
  try {
    await createPgContact(db()).submit({ topic, body, email, address: session?.address ?? null });
  } catch {
    return back(req, "error=down");
  }
  return back(req, "sent=1");
}
