/**
 * Where RedStone's signed packages come from (D-210). RedStone is switching its public gateways off: since 2026-10-08
 * they refuse requests in daily windows that grow until 2026-10-29, when they stop for good (`public_gateway_rejected`;
 * "No API key works on these hosts"). The replacement is an authenticated gateway — a URL and an API key RedStone issues,
 * two pairs for failover, sent as `x-api-key`, at most one request a second per key. Server-side only: a browser asks
 * our own proxy (`/api/prices/redstone-payload`), never a gateway with a key.
 *
 * Every gateway the process knows, in order (D-230): `REDSTONE_GATEWAYS` (a secret: JSON `[{"url":"…","apiKey":"…"}, …]`),
 * then `REDSTONE_GATEWAY_URLS` (comma separated, no key), then the public pair — which answers outside RedStone's
 * rejection windows until 2026-10-29 (`REDSTONE_PUBLIC_FALLBACK=0` leaves it out). A refusing gateway rests briefly
 * and the next one answers, so the moment a key lands it carries every read, and until then nothing stalls on one host.
 * The packages, signers and data service are the same either way; only the transport changes.
 */
import { REDSTONE_GATEWAY, redstoneHistoricalUrl, redstoneLatestUrl } from "./redstone";

export interface RedstoneGateway {
  url: string;
  /** Null for a public gateway. Never logged: name a gateway by `redstoneGatewayName`. */
  apiKey: string | null;
}

export interface RedstoneResponse {
  text: string;
  fetchedAtMs: number;
  /** The answering gateway's origin (safe to show). */
  gateway: string;
  /** Whether the answering gateway is an authenticated one (its key sent). */
  keyed: boolean;
}

export const PUBLIC_REDSTONE_GATEWAYS: readonly RedstoneGateway[] = [
  { url: REDSTONE_GATEWAY, apiKey: null },
  { url: "https://oracle-gateway-1.a.redstone.finance", apiKey: null },
];
/** RedStone's limit on its authenticated gateways: one request a second per API key. */
export const REDSTONE_KEY_INTERVAL_MS = 1_000;

const clean = (url: string) => url.trim().replace(/\/+$/, "");

/** Every gateway, authenticated first, then plain URLs, then the public pair; throws on a malformed `REDSTONE_GATEWAYS`
 * rather than run without it. A URL listed twice is asked once (its first, keyed entry). */
export function redstoneGatewaysFromEnv(env: Record<string, string | undefined> = process.env): RedstoneGateway[] {
  const out: RedstoneGateway[] = [];
  const add = (g: RedstoneGateway) => void (out.some((x) => x.url === g.url) || out.push(g));
  const json = env.REDSTONE_GATEWAYS?.trim();
  if (json) {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("REDSTONE_GATEWAYS must be a non-empty JSON array of {url, apiKey}");
    parsed.forEach((g, i) => {
      const { url, apiKey } = (g ?? {}) as { url?: unknown; apiKey?: unknown };
      if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new Error(`REDSTONE_GATEWAYS[${i}].url must be an https URL`);
      add({ url: clean(url), apiKey: typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null });
    });
  }
  for (const url of (env.REDSTONE_GATEWAY_URLS ?? "").split(",").map(clean).filter(Boolean)) add({ url, apiKey: null });
  if (env.REDSTONE_PUBLIC_FALLBACK?.trim() !== "0" || out.length === 0) PUBLIC_REDSTONE_GATEWAYS.forEach(add);
  return out;
}

/** A gateway as logs and `/health` may show it: its origin and whether it is keyed — never the key. */
export const redstoneGatewayName = (g: RedstoneGateway) => `${new URL(g.url).origin}${g.apiKey ? " (key)" : ""}`;
/** The gateway that answered, named as `redstoneGatewayName` names it. */
export const redstoneAnswerName = (r: Pick<RedstoneResponse, "gateway" | "keyed">) => `${r.gateway}${r.keyed ? " (key)" : ""}`;

// One request a second per key, in this process: each keyed request takes the next free slot.
const nextSlotMs = new Map<string, number>();
async function keySlot(apiKey: string): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlotMs.get(apiKey) ?? 0);
  nextSlotMs.set(apiKey, at + REDSTONE_KEY_INTERVAL_MS);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

// A gateway that refuses is left alone in this process — every reader shares the module, so a refusal stops the whole
// process asking instead of each actor retrying into a block — and the first answer resets it. How long depends on
// why (D-230): RedStone's switch-off window (`public_gateway_rejected`) ends on a schedule asking can't move, so it is
// probed every 30 s, doubling to two minutes — at ten minutes the prints came back up to ten minutes after the window
// closed (10-12 07:05, 10-13 05:41), two 5-minute Windows lost each time. Its CDN's block ("Request blocked", or a
// 429) is a host that kept asking (2026-10-08: the ops host stayed blocked after the window ended), so it rests a
// minute, doubling to ten.
export const REDSTONE_COOLDOWN_MS = { first: 30_000, max: 120_000 } as const;
export const REDSTONE_BLOCK_COOLDOWN_MS = { first: 60_000, max: 600_000 } as const;
const cooling = new Map<string, { untilMs: number; backoffMs: number; reason: string }>();

/** Forgets every cooldown (tests). */
export function resetRedstoneCooldowns(): void {
  cooling.clear();
}

async function fetchFirst(gateways: readonly RedstoneGateway[], urlOf: (gateway: string) => string, timeoutMs: number): Promise<RedstoneResponse> {
  let last = "no gateway configured";
  for (const g of gateways) {
    const name = redstoneGatewayName(g);
    const cool = cooling.get(g.url);
    if (cool && Date.now() < cool.untilMs) {
      last = `${cool.reason} from ${name}, resting ${Math.ceil((cool.untilMs - Date.now()) / 1000)} s`;
      continue;
    }
    try {
      if (g.apiKey) await keySlot(g.apiKey);
      const res = await fetch(urlOf(g.url), { signal: AbortSignal.timeout(timeoutMs), cache: "no-store", headers: g.apiKey ? { "x-api-key": g.apiKey } : {} });
      const text = await res.text();
      if (res.ok && text.startsWith("{")) {
        cooling.delete(g.url);
        return { text, fetchedAtMs: Date.now(), gateway: new URL(g.url).origin, keyed: g.apiKey !== null };
      }
      const code = /"error"\s*:\s*"([a-z_]+)"/.exec(text)?.[1];
      const reason = `HTTP ${res.status}${code ? ` ${code}` : /Request blocked/.test(text) ? " blocked by the CDN" : ""}`;
      if (res.status === 403 || res.status === 429) {
        const rest = code === "public_gateway_rejected" ? REDSTONE_COOLDOWN_MS : REDSTONE_BLOCK_COOLDOWN_MS;
        const backoffMs = cool ? Math.min(rest.max, Math.max(rest.first, cool.backoffMs * 2)) : rest.first;
        cooling.set(g.url, { untilMs: Date.now() + backoffMs, backoffMs, reason });
      }
      last = `${reason} from ${name}`;
    } catch (error) {
      last = `${name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  throw new Error(`RedStone gateways failed (${last})`);
}

/** Every feed's packages at `tSec` (≈ 1.9 MB: fetch a boundary once and cut feeds out of the text). */
export const fetchRedstoneAt = (tSec: number, gateways: readonly RedstoneGateway[], timeoutMs = 20_000) => fetchFirst(gateways, (g) => redstoneHistoricalUrl(tSec, g), timeoutMs);

// The newest packages, one fetch shared across callers for `shareMs` (the spot feed, the keepers, the calendar and the
// proxy all want "now"; a keyed gateway allows one request a second).
let shared: { atMs: number; key: string; response: Promise<RedstoneResponse> } | null = null;

/** `shareMs: 0` always fetches (the spot feed, whose pass is the reading) and still leaves its answer for the others. */
export function fetchRedstoneLatest(gateways: readonly RedstoneGateway[], options: { shareMs?: number; timeoutMs?: number } = {}): Promise<RedstoneResponse> {
  const now = Date.now();
  const key = gateways.map((g) => g.url).join(",");
  const shareMs = options.shareMs ?? 1_000;
  if (shareMs > 0 && shared && shared.key === key && now - shared.atMs < shareMs) return shared.response;
  const response = fetchFirst(gateways, (g) => redstoneLatestUrl(g), options.timeoutMs ?? 20_000);
  const entry = { atMs: now, key, response };
  shared = entry;
  response.catch(() => {
    if (shared === entry) shared = null;
  });
  return response;
}
