// Field Web Vitals (D-071). POST: a page's samples (sendBeacon, no identifiers). GET ?days=7: p75 per route and
// metric for this deployment's network — what S19 checks at each deploy against §3.1 (LCP ≤ 2.5 s, INP ≤ 200 ms,
// CLS ≤ 0.05).
import { createPgVitalsStore, VITAL_METRICS, type VitalSample } from "@cwf/db";
import { routeTemplate } from "@/lib/route-template";
import { ceremonyLimiter } from "@/server/auth";
import { db } from "@/server/db";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";
import { ipHash } from "@/server/request";

const RATINGS = new Set(["good", "needs-improvement", "poor"]);
const MAX_VALUE: Record<string, number> = { LCP: 120_000, INP: 60_000, CLS: 50, FCP: 120_000, TTFB: 120_000 };

function sample(raw: unknown, nowMs: number, network: string): VitalSample | null {
  const r = raw as Record<string, unknown>;
  if (typeof r?.metric !== "string" || !(VITAL_METRICS as readonly string[]).includes(r.metric)) return null;
  if (typeof r.value !== "number" || !Number.isFinite(r.value) || r.value < 0 || r.value > MAX_VALUE[r.metric]!) return null;
  if (typeof r.rating !== "string" || !RATINGS.has(r.rating) || typeof r.route !== "string") return null;
  return {
    route: routeTemplate(r.route),
    metric: r.metric as VitalSample["metric"],
    value: r.value,
    rating: r.rating as VitalSample["rating"],
    navigationType: typeof r.navigationType === "string" ? r.navigationType.slice(0, 24) : "unknown",
    network,
    createdAtMs: nowMs,
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (!(await ceremonyLimiter().allow(`vitals:${ipHash(req)}`, 60, 60))) return new Response(null, { status: 429 });
    const body = (await req.json().catch(() => null)) as unknown[] | null;
    if (!Array.isArray(body) || body.length === 0 || body.length > 10) return new Response(null, { status: 400 });
    const nowMs = Date.now();
    const network = serverEnv().network;
    const samples = body.map((b) => sample(b, nowMs, network)).filter((s): s is VitalSample => s !== null);
    await createPgVitalsStore(db()).save(samples);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 7) || 7));
    const rows = await createPgVitalsStore(db()).summary(Date.now() - days * 86_400_000, serverEnv().network);
    return Response.json({ days, network: serverEnv().network, budgets: { LCP: 2_500, INP: 200, CLS: 0.05 }, rows }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}
