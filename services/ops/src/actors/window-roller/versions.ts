// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/window-roller/versions.ts (Pyth
// entitlement dropped: every Tempo source is keyless on testnet; Data Streams versions carry their own feed id).
/** Policy-version coverage off-chain: the same rule `openWindow` checks with `SourceNotCovered` (E-26 step 10). */
import type { PolicyView } from "@cwf/markets/ops";

export interface VersionWindow {
  validFromSec: number;
  /** null = open-ended. */
  validUntilSec: number | null;
  primarySource: number;
  checkSource: number;
  /** `primary.openAdmissionSec`; `ADMIT_UNTIL_LOCK` (u32::MAX) admits until `lockAt`. */
  openAdmissionSec: number;
  checkAdmissionSec: number;
}

export const SOURCE_NAME: Record<number, string> = { 0: "none", 2: "redstone", 4: "attested", 5: "datastreams" };
export const ADMIT_UNTIL_LOCK = 0xffff_ffff;

export const versionWindow = (v: PolicyView): VersionWindow => ({
  validFromSec: v.validFromSec,
  validUntilSec: v.validUntilSec,
  primarySource: v.primary.source,
  checkSource: v.check.source,
  openAdmissionSec: v.primary.openAdmissionSec,
  checkAdmissionSec: v.checkAdmissionSec,
});

/**
 * Whether a Window opened now can still take its opening prints: the primary open before `openDeadline` and, with a
 * check, the check open before `T + checkAdmissionSec`, each with `marginSec` for the relay. A late open would void at
 * once (no open print) or settle single-source, so the roller skips to the next Window instead.
 */
export function openPrintsAdmissible(v: VersionWindow, w: { tradingStartSec: number; lockAtSec: number }, nowSec: number, marginSec: number): boolean {
  const openDeadline = v.openAdmissionSec === ADMIT_UNTIL_LOCK ? w.lockAtSec : w.tradingStartSec + v.openAdmissionSec;
  if (nowSec + marginSec > openDeadline) return false;
  return v.checkSource === 0 || nowSec + marginSec <= w.tradingStartSec + v.checkAdmissionSec;
}

const covers = (v: VersionWindow, startSec: number, expirySec: number) => v.validFromSec <= startSec && (v.validUntilSec === null || expirySec <= v.validUntilSec);

/** `max { i : covers(v_i, W) }`, or null: the Window is not listed (the engine would refuse `SourceNotCovered`). */
export function highestCoveringVersion(versions: readonly VersionWindow[], startSec: number, expirySec: number): number | null {
  for (let i = versions.length - 1; i >= 0; i--) if (covers(versions[i]!, startSec, expirySec)) return i;
  return null;
}

export const PAUSED_NO_SOURCE = "paused: no signed source";

/** `v1 redstone`, `v2 datastreams+redstone` (1-based). */
export function describeVersion(index: number, v: VersionWindow): string {
  const check = v.checkSource === 0 ? "" : `+${SOURCE_NAME[v.checkSource] ?? v.checkSource}`;
  return `v${index + 1} ${SOURCE_NAME[v.primarySource] ?? v.primarySource}${check}`;
}
