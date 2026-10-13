// `POST /api/themes/revalidate` (R6, D-230; D-231): after a confirmed theme write (publish, follow, stop) the page expires
// the themes' "use cache" tag and the strategies desk's (a theme is a strategy; the catalogue is the desk's read), so
// the next render shows the change rather than the last 30 s. It carries nothing and changes no data — only the cache's
// age — so it is open and rate-limited, as `/api/strategies/revalidate`: one per 10 s per address, 120 an hour in all.
import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { STRATEGIES_CACHE_TAG } from "@/features/strategies/strategies.server";
import { THEMES_CACHE_TAG } from "@/features/themes/themes.server";
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
  revalidateTag(THEMES_CACHE_TAG, { expire: 0 });
  revalidateTag(STRATEGIES_CACHE_TAG, { expire: 0 });
  return Response.json({ ok: true });
}
