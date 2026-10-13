import { describe, expect, it } from "vitest";
import { diagnosis } from "../types/diagnosis";
import { canConfirm, confirmTierFor, moneyMovedFor, reduceTx, TX_IDLE, UNDO_WINDOW_MS, type TxEvent, type TxState } from "./lifecycle";

const HASH = `0x${"ab".repeat(32)}` as const;
const run = (events: TxEvent[], from: TxState = TX_IDLE) => events.reduce(reduceTx, from);

describe("TxLifecycle (D-052)", () => {
  it("walks the happy path and confirms on the receipt", () => {
    const states = [{ type: "evaluate", blocker: null }, { type: "review" }, { type: "confirm", nowMs: 0 }, { type: "submitted", txHash: HASH, validBeforeSec: 125 }, { type: "receipt", txHash: HASH, status: "success" }] as TxEvent[];
    const trail: string[] = [];
    states.reduce((s, e) => {
      const next = reduceTx(s, e);
      trail.push(next.kind);
      return next;
    }, TX_IDLE);
    expect(trail).toEqual(["idle", "review", "signing", "submitted", "confirmed"]);
  });

  it("names the blocker, and lets it clear", () => {
    expect(run([{ type: "evaluate", blocker: "Enter a stake" }])).toEqual({ kind: "blocked", reason: "Enter a stake" });
    expect(run([{ type: "evaluate", blocker: "Enter a stake" }, { type: "evaluate", blocker: null }])).toEqual(TX_IDLE);
  });

  it("absorbs a double tap and ignores blockers while signing", () => {
    const signing = run([{ type: "confirm", nowMs: 0 }]);
    expect(reduceTx(signing, { type: "confirm", nowMs: 1 })).toBe(signing);
    expect(reduceTx(signing, { type: "evaluate", blocker: "Quote is stale" })).toBe(signing);
    expect(canConfirm(signing)).toBe(false);
  });

  it("goes optimistic on submit and rolls back when the receipt reverts", () => {
    const optimistic = run([{ type: "confirm", nowMs: 0 }, { type: "submitted", txHash: HASH, validBeforeSec: 25, optimistic: true }]);
    expect(optimistic).toEqual({ kind: "confirmed", txHash: HASH, pending: true });
    const rolledBack = reduceTx(optimistic, { type: "receipt", txHash: HASH, status: "reverted" });
    expect(rolledBack).toMatchObject({ kind: "failed", moneyMoved: "no", txHash: HASH });
  });

  it("says nothing moved when the user cancels, and 'unknown' only for an unanswered send", () => {
    const cancelled = run([{ type: "confirm", nowMs: 0 }, { type: "error", diagnosis: diagnosis("user-rejected", "no") }]);
    expect(cancelled).toMatchObject({ kind: "failed", moneyMoved: "no" });
    expect(moneyMovedFor(diagnosis("send-unknown", "t"), true)).toBe("unknown");
    expect(moneyMovedFor(diagnosis("contract-revert", "t"), true)).toBe("no");
  });

  it("holds an unanswered send as unknown until reconciled — never re-sent", () => {
    const unknown = run([{ type: "confirm", nowMs: 0 }, { type: "submitted", txHash: null, validBeforeSec: 125 }, { type: "timeout", diagnosis: diagnosis("send-unknown", "t") }]);
    expect(unknown).toEqual({ kind: "unknown", txHash: null, validBeforeSec: 125 });
    expect(canConfirm(unknown)).toBe(false);
    expect(reduceTx(unknown, { type: "reset" })).toBe(unknown);
    expect(reduceTx(unknown, { type: "reconciled", verdict: "absent" })).toMatchObject({ kind: "failed", moneyMoved: "no" });
    expect(reduceTx(unknown, { type: "reconciled", verdict: "confirmed", txHash: HASH })).toEqual({ kind: "confirmed", txHash: HASH, pending: false });
  });

  it("waits out the undo window for non-urgent revokes", () => {
    const scheduled = run([{ type: "confirm", nowMs: 1_000, undoMs: UNDO_WINDOW_MS }]);
    expect(scheduled).toEqual({ kind: "scheduled", runAtMs: 6_000 });
    expect(reduceTx(scheduled, { type: "undo" })).toEqual(TX_IDLE);
    expect(reduceTx(scheduled, { type: "undo-elapsed" })).toEqual({ kind: "signing" });
  });

  it("picks the confirmation tier", () => {
    expect(confirmTierFor({ signer: "access-key", withinCaps: true, irreversible: false })).toBe("tap");
    expect(confirmTierFor({ signer: "access-key", withinCaps: false, irreversible: false })).toBe("passkey");
    expect(confirmTierFor({ signer: "passkey", withinCaps: true, irreversible: false })).toBe("passkey");
    expect(confirmTierFor({ signer: "passkey", withinCaps: true, irreversible: true })).toBe("typed");
  });

  it("ends a tap the lane re-priced before signing — a reset alone would leave it busy", () => {
    const signing = run([{ type: "confirm", nowMs: 0 }]);
    expect(signing).toEqual({ kind: "signing" });
    expect(reduceTx(signing, { type: "reset" })).toEqual({ kind: "signing" });
    expect(reduceTx(signing, { type: "requoted" })).toEqual(TX_IDLE);
    const submitted = run([{ type: "confirm", nowMs: 0 }, { type: "submitted", txHash: HASH, validBeforeSec: null }]);
    expect(reduceTx(submitted, { type: "requoted" })).toBe(submitted);
  });
});
