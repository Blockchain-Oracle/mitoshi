// `POST /api/strategies/revalidate` (R4-6, D-227; automate bug 1): a creator's studio, right after its publish receipt,
// expires the catalogue's "use cache" tag so the next read lists the new strategy. It carries nothing and changes no
// data — only the cache's age — so it is open, and rate-limited: one per 10 s per address, 120 an hour in all.
import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { STRATEGIES_CACHE_TAG } from "@/features/strategies/strategies.server";
import { clientIp } from "@/server/request";

const MIN_GAP_MS = 10_000;
const PER_HOUR = 120;
const HOUR_MS = 3_600_000;
const lastByIp = new Map<string, number>();
let hourHits: number[] = [];

export async function POST(req: Request): Promise<Response> {
  await connection();
  const now = Date.now();
  const ip = clientIp(req);
  hourHits = hourHits.filter((at) => now - at < HOUR_MS);
  if (now - (lastByIp.get(ip) ?? 0) < MIN_GAP_MS || hourHits.length >= PER_HOUR) return Response.json({ error: "too_many" }, { status: 429 });
  if (lastByIp.size > 5_000) lastByIp.clear();
  lastByIp.set(ip, now);
  hourHits.push(now);
  revalidateTag(STRATEGIES_CACHE_TAG, { expire: 0 });
  return Response.json({ ok: true });
}
