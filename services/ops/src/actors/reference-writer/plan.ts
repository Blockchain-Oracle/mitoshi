/**
 * The reference-writer's decisions, pure (plan B.3.2, S15b): which mirrors get a fresh RedStone spot pushed and whether
 * the keeper session flag needs rewriting. `index.ts` does the reads and the send.
 */
import type { RedStonePackage } from "@cwf/core/prices/redstone";
import { decimalToE8, latestSpot, redstoneMedianE8, packagesAt, toHex } from "@cwf/core/prices/redstone";
import { SESSIONS, type Session } from "@cwf/core/stocks/guard";
import { sessionFromNextChange, type SessionCall } from "@cwf/core/stocks/session";

/** Seconds between pushes per session: the REGULAR max age is 120 s, the CLOSED one 4 days (Q-024). */
export const PUSH_EVERY_SEC: Record<Session, number> = { REGULAR: 30, EXTENDED: 30, CLOSED: 600, UNKNOWN: 600 };
/** Rewrite the flag when this little validity is left, so it never lapses into UNKNOWN between passes. */
export const SESSION_REFRESH_SEC = 180;
export const NEXT_CHANGE_FEED = "NY_MARKET_NEXT_CHANGE_TIME";

export interface MirrorState {
  ticker: string;
  mirror: `0x${string}`;
  /** RedStone feed pinned on-chain (`feedsOf`); empty = no signed source (NFLX on Tempo). */
  feed: string;
  observedAtSec: number;
}

export interface Push {
  ticker: string;
  mirror: `0x${string}`;
  payload: `0x${string}`;
  tSec: number;
  medianE8: bigint;
}

export interface Plan {
  pushes: Push[];
  skipped: string[];
  session: SessionCall | null;
  sessionWrite: boolean;
}

/** bytes32 ASCII → string (trailing zero bytes dropped). */
export function feedName(b32: `0x${string}`): string {
  const hex = b32.slice(2).replace(/(00)+$/, "");
  let s = "";
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return s;
}

/** The signed next-change time: the median of the newest timestamp's allowed signers (≥ threshold), in ms. */
export function nextChangeMs(all: Record<string, RedStonePackage[]>, threshold: number, signers: readonly string[]): number | null {
  const allowed = new Set(signers.map((s) => s.toLowerCase()));
  const stamps = [...new Set((all[NEXT_CHANGE_FEED] ?? []).map((p) => p.timestampMilliseconds))].sort((a, b) => b - a);
  for (const tMs of stamps) {
    const pkgs = packagesAt(all, NEXT_CHANGE_FEED, tMs).filter((p) => allowed.has(p.signerAddress.toLowerCase()));
    if (pkgs.length < threshold) continue;
    return Number(redstoneMedianE8(pkgs.map((p) => decimalToE8(String(p.dataPoints[0]!.value)) / 100_000_000n)));
  }
  return null;
}

export function plan(p: {
  nowMs: number;
  all: Record<string, RedStonePackage[]>;
  mirrors: readonly MirrorState[];
  threshold: number;
  signers: readonly string[];
  lastPushSec: ReadonlyMap<string, number>;
  onchainSession: { session: number; untilSec: number };
  lastCloseMs: number | null;
}): Plan {
  const nowSec = Math.floor(p.nowMs / 1000);
  const next = nextChangeMs(p.all, p.threshold, p.signers);
  const session = next === null ? null : sessionFromNextChange(p.nowMs, next, p.lastCloseMs);
  const effective: Session = session?.session ?? (p.onchainSession.untilSec >= nowSec ? SESSIONS[p.onchainSession.session] ?? "UNKNOWN" : "UNKNOWN");
  const every = PUSH_EVERY_SEC[effective];
  const pushes: Push[] = [];
  const skipped: string[] = [];
  for (const m of p.mirrors) {
    if (!m.feed) {
      skipped.push(`${m.ticker}: no signed source`);
      continue;
    }
    const spot = latestSpot(p.all, m.feed, p.threshold, p.signers);
    if (!spot) {
      skipped.push(`${m.ticker}: < ${p.threshold} signers`);
      continue;
    }
    const tSec = Math.floor(spot.tMs / 1000);
    if (tSec <= m.observedAtSec) continue; // on-chain is as new (another writer got there)
    if (nowSec - (p.lastPushSec.get(m.mirror) ?? 0) < every && nowSec - m.observedAtSec < every) continue;
    pushes.push({ ticker: m.ticker, mirror: m.mirror, payload: toHex(spot.payload), tSec, medianE8: spot.medianE8 });
  }
  let sessionWrite = false;
  if (session) {
    const wantIdx = SESSIONS.indexOf(session.session);
    const validUntilSec = Math.floor(session.validUntilMs / 1000);
    const lapsing = p.onchainSession.untilSec - nowSec < SESSION_REFRESH_SEC;
    sessionWrite = validUntilSec > nowSec && (p.onchainSession.session !== wantIdx || lapsing || p.onchainSession.untilSec < nowSec);
  }
  return { pushes, skipped, session, sessionWrite };
}
