import "server-only";
// Ported from Agari 03b30ab:web/src/features/sensei/rate.server.ts — every accepted question is a model call the house
// pays for. In memory per instance: one question per IP per 3 s, 30 per IP per 10 min, 600 an hour house-wide. A
// refused question is not recorded, so waiting out the gap always works.
const MIN_GAP_MS = 3_000;
const PER_IP = 30;
const PER_IP_WINDOW_MS = 600_000;
const HOUSE_PER_HOUR = 600;
const HOUR_MS = 3_600_000;
/** Idle IPs are swept once the map grows past this, so a long-lived instance does not keep every visitor. */
const SWEEP_AT = 5_000;

const asksByIp = new Map<string, number[]>();
let houseAsks: number[] = [];

/** The caller's IP as the proxy reports it; "local" when nothing does (a dev server). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** True when this question may go to the model, and records it. */
export function senseiGate(ip: string, nowMs: number): boolean {
  const recent = (asksByIp.get(ip) ?? []).filter((at) => nowMs - at < PER_IP_WINDOW_MS);
  const last = recent.at(-1);
  if (last !== undefined && nowMs - last < MIN_GAP_MS) return false;
  if (recent.length >= PER_IP) return false;
  houseAsks = houseAsks.filter((at) => nowMs - at < HOUR_MS);
  if (houseAsks.length >= HOUSE_PER_HOUR) return false;
  recent.push(nowMs);
  asksByIp.set(ip, recent);
  houseAsks.push(nowMs);
  if (asksByIp.size > SWEEP_AT) {
    for (const [ip2, asks] of asksByIp) if (nowMs - (asks.at(-1) ?? 0) >= PER_IP_WINDOW_MS) asksByIp.delete(ip2);
  }
  return true;
}
