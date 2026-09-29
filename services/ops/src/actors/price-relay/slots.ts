// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/markets/src/ops/prints.ts (`emptySlots`,
// `relayFinished`) — the Market account's print slots → `MarketView.prints`; copy-open added (E-48).
/**
 * Which print slots of a Window the relay still owes, when each is admissible, and whether the open can be copied
 * from the previous Window's close (same Series, back to back, same policy version: `copyOpenFromPrev`). Pure.
 */
import type { MarketView, PolicyView, SeriesView } from "@cwf/markets/ops";

export type SlotName = "open" | "close" | "checkOpen" | "checkClose";
export const WHICH: Record<SlotName, number> = { open: 0, close: 1, checkOpen: 2, checkClose: 3 };
export const SOURCE = { none: 0, redstone: 2, attested: 4, datastreams: 5 } as const;

export interface PrintSlot {
  market: MarketView;
  series: SeriesView;
  slot: SlotName;
  /** The boundary T (tradingStart for opens, expiry for closes). */
  boundarySec: number;
  /** First second the engine admits it (T + minDelay). */
  earliestSec: number;
  /** Last second the engine admits it. */
  deadlineSec: number;
  source: number;
  feedId: `0x${string}`;
  strictSec: number;
  barLenSec: number;
  minDelaySec: number;
  verifier: `0x${string}`;
}

const filled = (m: MarketView, s: SlotName) => m.prints[s].source !== 0;

/** Every empty, still-admissible-or-future slot of an open Window. */
export function emptySlots(series: SeriesView, m: MarketView): PrintSlot[] {
  if (m.state !== 0) return [];
  const v: PolicyView | undefined = series.versions[m.policyVersion];
  if (!v) return [];
  const out: PrintSlot[] = [];
  const push = (slot: SlotName, check: boolean) => {
    const p = check ? v.check : v.primary;
    if (p.source === SOURCE.none || filled(m, slot)) return;
    const t = slot === "open" || slot === "checkOpen" ? m.tradingStartSec : m.expirySec;
    const deadline = slot === "open" ? m.openDeadlineSec : slot === "close" ? m.closeDeadlineSec : t + v.checkAdmissionSec;
    out.push({ market: m, series, slot, boundarySec: t, earliestSec: t + p.minDelaySec, deadlineSec: deadline, source: p.source, feedId: p.feedId as `0x${string}`, strictSec: p.strictSec, barLenSec: p.barLenSec, minDelaySec: p.minDelaySec, verifier: p.verifier as `0x${string}` });
  };
  push("checkOpen", true);
  push("checkClose", true);
  push("open", false);
  push("close", false);
  return out;
}

/** Nothing left for the relay: terminal, or every empty slot is past its deadline. */
export function relayFinished(series: SeriesView, m: MarketView, nowSec: number): boolean {
  return emptySlots(series, m).every((s) => nowSec > s.deadlineSec);
}

/** Whether `m`'s open can be copied from `prev` now (the engine's own E-48 conditions, checked off-chain first). */
export function copyableOpen(m: MarketView, prev: MarketView | null, nowSec: number): boolean {
  if (!prev || prev.seriesIdx !== m.seriesIdx || filled(m, "open") || m.state !== 0) return false;
  return prev.expirySec === m.tradingStartSec && prev.policyVersion === m.policyVersion && filled(prev, "close") && nowSec <= m.openDeadlineSec;
}

/** Signers a RedStone print needs at `nowSec`: every configured signer inside `T + strictSec`, the threshold after. */
export const redstoneNeed = (slot: PrintSlot, nowSec: number, signerCount: number, threshold: number) => (nowSec < slot.boundarySec + slot.strictSec ? signerCount : threshold);
