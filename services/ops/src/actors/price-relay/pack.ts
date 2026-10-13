/**
 * How a relay pass ranks its prints for packing (D-230 item 1, `../../runtime/pack.ts`). At a boundary every Series
 * owes its closing Window's close and the next Window's open, and a 15- or 60-minute boundary is also a 5-minute one:
 * 76–228 prints land together. Sent one transaction each, they queued in the RPC budget the whole ops process shares
 * (D-134): the opening print landed 38–98 s after the Window's start (measured 2026-10-13, `scripts/drive/
 * print-latency.ts`), a fifth to a third of a 5-minute Window untradeable.
 *
 * Instead a close travels with the next Window's open copied from it (E-48: `copyOpenFromPrev` reads the close the call
 * before it wrote), and the units pack into a few transactions: a check slot before anything (its admission ends at
 * T + checkAdmissionSec), then 5-minute Windows before 15 and 60, then the earlier deadline. Pure.
 */
import type { sendOps } from "@cwf/markets/ops";
import { MAX_CALLS_PER_TX, packUnits, type PackUnit } from "../../runtime/pack";

type Call = Parameters<typeof sendOps>[1][number];

/** One print to send: what it is for, its call, and how the pass reports it. */
export interface PrintCall<J> {
  job: J;
  call: Call;
  note: string;
  /** A copied open (E-48) rather than a proven print. */
  copy: boolean;
}

/** Prints that go together, in order (a close, then the open copied from it), and how urgent they are. */
export interface PrintUnit<J> extends PackUnit<PrintCall<J>> {
  items: PrintCall<J>[];
  cadenceSec: number;
  deadlineSec: number;
  check: boolean;
}

/** Check slots first, then shorter cadences, then the earlier deadline. */
export function unitOrder<J>(a: PrintUnit<J>, b: PrintUnit<J>): number {
  return Number(b.check) - Number(a.check) || a.cadenceSec - b.cadenceSec || a.deadlineSec - b.deadlineSec;
}

/** The pass's units as transactions, most urgent first. */
export const packPrints = <J>(units: readonly PrintUnit<J>[], maxCalls = MAX_CALLS_PER_TX): PrintUnit<J>[][] => packUnits([...units].sort(unitOrder), maxCalls);
