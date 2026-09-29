// Ported from Agari 03b30ab:packages/core/src/market/void-reason.ts
import type { LaneBasis, PrintSource, VoidReason } from "../types/market";
import type { VoidDetail, VoidSlot } from "../types/session-lanes";
import { ET_WEEKDAY_SHORT, etDateOf, formatEtClock, weekdayOfDate } from "./et-time";

/**
 * Why a Window voided, in words (session-lanes.md §3.2, D-057). The engine stores `voidReason { None, MissingPrint,
 * CrossCheckDivergence }` in `Market`; the slot comes from which of its prints is empty (or diverges). A halt is
 * never named as the cause: the verdict says what the chain saw.
 */

/** Masayume's void line, verbatim (M `packages/core/src/copy/verdict.ts:29`), always shown first. */
export const VOID_HEADLINE = "Void — no reliable print, both sides pay 0.5";

/** The share-card stamp (S5d's wording, proof-analytics.md). */
export const VOID_SHARE_WORD: Readonly<Record<VoidReason, string>> = {
  "missing-print": "VOID · MISSING PRINT",
  "cross-check-divergence": "VOID · CROSS-CHECK DIVERGENCE",
};

/** D-003 admission defaults (`price-sources.json` `defaults`), used only when the caller can't pass the Market's frozen deadlines. */
const DEFAULT_ADMISSION_SEC: Readonly<Record<PrintSource, number>> = { redstone: 900, datastreams: 900, attested: 900 };
/** `crossCheck.maxDivergenceBps` (D-003). */
export const DEFAULT_MAX_DIVERGENCE_BPS = 25;

const SOURCE_NAME: Readonly<Record<PrintSource, string>> = { redstone: "RedStone", datastreams: "Chainlink Data Streams", attested: "attested" };

/**
 * A voided Window as its reader knows it. Prints are × 10⁻⁸: `null` = the slot is empty, `undefined` = not read
 * (an index row without prints), which leaves the slot unnamed rather than guessed.
 */
export interface VoidInput {
  voidReason: VoidReason | null;
  lane: LaneBasis;
  /** The version's primary source (both primary slots use it, PD-1). */
  primarySource: PrintSource | null;
  checkSource?: PrintSource | null;
  tradingStartSec: number;
  lockAtSec: number;
  expirySec: number;
  openE8: bigint | null | undefined;
  closeE8: bigint | null | undefined;
  checkOpenE8?: bigint | null;
  checkCloseE8?: bigint | null;
  /** The Market's frozen `open_deadline` / `close_deadline`; otherwise derived from the source defaults and the lane. */
  openDeadlineSec?: number;
  closeDeadlineSec?: number;
  maxDivergenceBps?: number;
}

function deadlineOf(input: VoidInput, slot: VoidSlot): number | null {
  const given = slot === "open" ? input.openDeadlineSec : input.closeDeadlineSec;
  if (given !== undefined) return given;
  if (slot === "open" && input.lane === "gap") return input.lockAtSec;
  if (!input.primarySource) return null;
  return (slot === "open" ? input.tradingStartSec : input.expirySec) + DEFAULT_ADMISSION_SEC[input.primarySource];
}

/** `|p − c| × 10⁴ > bps × p`, the settle rule (prints.md §5 step 3). */
function diverges(primary: bigint | null | undefined, check: bigint | null | undefined, bps: number): boolean {
  if (primary == null || check == null) return false;
  const gap = primary > check ? primary - check : check - primary;
  return gap * 10_000n > BigInt(bps) * primary;
}

/**
 * The reason, slot, source, boundary and deadline of a void; null when the Window didn't void.
 * - `missing-print`: the open slot when it's empty (its deadline comes first), else the close slot.
 * - `cross-check-divergence`: the first pair (open, then close) whose check differs past the band; no deadline was missed.
 */
export function voidDetail(input: VoidInput): VoidDetail | null {
  const { voidReason: reason } = input;
  if (!reason) return null;
  if (reason === "missing-print") {
    const slot: VoidSlot | null = input.openE8 === null ? "open" : input.closeE8 === null ? "close" : null;
    return {
      reason,
      slot,
      source: input.primarySource,
      boundarySec: slot === null ? null : slot === "open" ? input.tradingStartSec : input.expirySec,
      deadlineSec: slot === null ? null : deadlineOf(input, slot),
    };
  }
  const bps = input.maxDivergenceBps ?? DEFAULT_MAX_DIVERGENCE_BPS;
  const slot: VoidSlot | null = diverges(input.openE8, input.checkOpenE8, bps) ? "open" : diverges(input.closeE8, input.checkCloseE8, bps) ? "close" : null;
  return {
    reason,
    slot,
    source: input.primarySource,
    boundarySec: slot === null ? null : slot === "open" ? input.tradingStartSec : input.expirySec,
    deadlineSec: null,
  };
}

/** "16:00:00" in ET. Boundaries sit on whole minutes, but ET's offset is whole hours, so UTC seconds are ET seconds. */
function etClockWithSeconds(sec: number): string {
  return `${formatEtClock(sec)}:${String(((sec % 60) + 60) % 60).padStart(2, "0")}`;
}

/** 25 → "0.25%", 100 → "1%", 150 → "1.5%". */
export function bpsPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = String(Math.abs(bps % 100)).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}

/**
 * The reason line under `VOID_HEADLINE`:
 * - "No signed RedStone price at 16:00:00 ET was recorded by 16:15:00 ET." (a deadline on another ET day names its weekday:
 *   a Gap open is admissible until "Sun 20:00:00 ET");
 * - "RedStone and Chainlink Data Streams differed by more than 0.25% at 16:00:00 ET."
 */
export function voidReasonLine(detail: VoidDetail, options: { checkSource?: PrintSource | null; maxDivergenceBps?: number } = {}): string {
  if (detail.reason === "cross-check-divergence") {
    const names = detail.source && options.checkSource ? `${SOURCE_NAME[detail.source]} and ${SOURCE_NAME[options.checkSource]}` : "The price and its cross-check";
    const at = detail.boundarySec === null ? "" : ` at ${etClockWithSeconds(detail.boundarySec)} ET`;
    return `${names} differed by more than ${bpsPercent(options.maxDivergenceBps ?? DEFAULT_MAX_DIVERGENCE_BPS)}${at}.`;
  }
  const price = detail.source === "attested" ? "No attested price" : `No signed ${detail.source ? `${SOURCE_NAME[detail.source]} ` : ""}price`;
  if (detail.boundarySec === null) return `${price} was recorded before its deadline.`;
  const boundary = `${price} at ${etClockWithSeconds(detail.boundarySec)} ET`;
  if (detail.deadlineSec === null) return `${boundary} was recorded in time.`;
  const sameDay = etDateOf(detail.deadlineSec) === etDateOf(detail.boundarySec);
  const weekday = sameDay ? "" : `${ET_WEEKDAY_SHORT[weekdayOfDate(etDateOf(detail.deadlineSec))]} `;
  return `${boundary} was recorded by ${weekday}${etClockWithSeconds(detail.deadlineSec)} ET.`;
}

/** Both lines, headline first. */
export function voidLines(detail: VoidDetail, options: { checkSource?: PrintSource | null; maxDivergenceBps?: number } = {}): [string, string] {
  return [VOID_HEADLINE, voidReasonLine(detail, options)];
}
