// Ported from Agari 03b30ab:packages/core/src/strategies/mirror.ts — the ledger fill is Mitoshi's own
// (`projection/types.ts`, the same shape); the attribution note is Tempo's (A-3b).
import type { LedgerFill } from "../projection/types";
import type { Decision, MirrorSpec } from "./types";

/**
 * Copy a human (A-3b).
 *
 * The signal is not a model: it is what one named wallet actually did on this Window, as the index recorded it.
 * A trader who bought UP and then sold half of it back has a smaller call, not two calls, so the fills are netted
 * in YES terms before a side is taken — buying NO and selling YES both lean the same way.
 *
 * What this cannot be is the same trade. A copier's order is sent after the trader's landed, into whatever the book
 * holds then, so the price differs and the fill may be smaller or nothing at all. The surface says so.
 *
 * On Tempo a position is the trader's own address — the engine's taker, or the owner the Trading Balance names in its
 * `Executed` event — so the ledger the index projects for that wallet is what is copied.
 */
const YES_SIGN: Record<LedgerFill["side"], bigint> = { BUY_YES: 1n, SELL_NO: 1n, SELL_YES: -1n, BUY_NO: -1n };

export interface MirrorInput {
  /** The trader's fills on this Window, any order. */
  fills: readonly LedgerFill[];
  spec: MirrorSpec;
  nowMs: number;
}

/** The trader's net lean on one Window, in raw contracts: positive is UP, negative is DOWN. */
export function netYesRaw(fills: readonly LedgerFill[]): bigint {
  return fills.reduce((total, fill) => total + YES_SIGN[fill.side] * fill.quantityRaw, 0n);
}

/**
 * One Window, one decision: the side the trader is net on, if they moved inside the window of interest. There is no
 * threshold, so `moveBps` and `thresholdBps` are 0 and the reason carries the size of the lean.
 */
export function decideMirror({ fills, spec, nowMs }: MirrorInput): Decision {
  const freshFrom = nowMs - spec.withinSec * 1_000;
  const fresh = fills.filter((fill) => fill.atMs >= freshFrom);
  if (fresh.length === 0) {
    return { side: null, moveBps: 0, thresholdBps: 0, reason: `no call from this trader in the last ${spec.withinSec}s` };
  }
  const net = netYesRaw(fresh);
  if (net === 0n) {
    return { side: null, moveBps: 0, thresholdBps: 0, reason: "this trader is flat on this Window: bought and sold back" };
  }
  const size = net < 0n ? -net : net;
  const side = net > 0n ? "up" : "down";
  return { side, moveBps: 0, thresholdBps: 0, reason: `copying this trader's ${side.toUpperCase()} call: net ${size} contracts across ${fresh.length} fill${fresh.length === 1 ? "" : "s"}` };
}
