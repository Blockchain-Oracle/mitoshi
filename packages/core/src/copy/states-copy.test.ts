// R6 (D-230, T06 + T20): the states kit's word budgets — Owarine's count. A CTA label ≤ 6 words and 30 characters, a
// reason ≤ 10 words on one line at 320 px, a diagnosis body ≤ 10 words, and a read never says "sent" or "taken".
import { describe, expect, it } from "vitest";
import { DIAGNOSIS_KINDS } from "../types/diagnosis";
import { BLOCKER_KINDS, blocker, blockerLabel, blockerLine, fixLabel, type BlockerContext } from "./blockers";
import { diagnosisCopy, fixForDiagnosis, readDiagnosisCopy } from "./diagnosis";
import { ERROR_BOUNDARY } from "./strings";
import { SIGNED_OUT, WAIT } from "./states";

const words = (s: string) => s.split(/\s+/).filter((w) => w !== "—" && w !== "·" && w !== "→" && w.length > 0).length;

// Every context field filled with the longest realistic value, so the budget holds at its worst.
const FULL: BlockerContext = {
  chainName: "Tempo",
  minStakeText: "$1.00",
  spendableText: "$12,345.67",
  quotedCents: 99,
  cadence: "15m",
  nextStartText: "14m 59s",
  fillableStakeText: "$1,234.56",
  quoteAgeSec: 12,
  privateMinText: "$10.00",
  privateCapText: "$500.00",
  opensText: "Mon 14:30 (09:30 ET)",
  haltStale: true,
  altWindowText: "AAPL 15m",
  refusalText: "Over the Window's cap.",
  openingText: "Opens 15:20 · price network late",
};

describe("blockers (T06)", () => {
  for (const kind of BLOCKER_KINDS) {
    for (const ctx of [{}, FULL]) {
      it(`${kind} ${ctx === FULL ? "(full ctx)" : "(no ctx)"} fits the budget`, () => {
        const b = blocker(kind, ctx);
        expect(words(b.label), b.label).toBeLessThanOrEqual(6);
        expect(b.label.length, b.label).toBeLessThanOrEqual(30);
        if (b.reason) {
          expect(words(b.reason), b.reason).toBeLessThanOrEqual(10);
          expect(b.reason.length, b.reason).toBeLessThanOrEqual(44);
        }
        if (b.fix) {
          const f = fixLabel(b.fix);
          expect(words(f), f).toBeLessThanOrEqual(6);
          expect(f.length, f).toBeLessThanOrEqual(30);
        }
        expect(blockerLabel(kind, ctx)).toBe(b.label);
        expect(b.kind).toBe(kind);
      });
    }
  }

  it("a blocker that names a fix carries it as data", () => {
    expect(blocker("no-funds").fix).toEqual({ kind: "add-money" });
    expect(fixLabel(blocker("no-funds").fix!)).toBe("Add money");
    expect(fixLabel(blocker("below-min-stake", { minStakeText: "$1" }).fix!)).toBe("Use $1");
    expect(fixLabel(blocker("no-liquidity-at-size", { fillableStakeText: "$3.40" }).fix!)).toBe("Buy $3.40 — what fills");
    expect(blocker("no-liquidity-at-size").fix).toBeNull();
    expect(fixLabel(blocker("locked", { altWindowText: "AAPL 15m" }).fix!)).toBe("Try AAPL 15m →");
    expect(blocker("locked").fix).toBeNull();
    expect(blocker("over-balance", { spendableText: "$0.40", spendableBelowMin: true }).fix).toEqual({ kind: "add-money" });
    expect(blocker("quote-refused", { refusalText: "Over the Window's cap." }).reason).toBe("Over the Window's cap.");
    expect(blocker("quoting").busy).toBe(true);
  });

  it("the one-line form keeps the reason where there is no caption", () => {
    expect(blockerLine("session-closed", { opensText: "Mon 14:30 (09:30 ET)" })).toBe("Market closed · Opens Mon 14:30 (09:30 ET)");
    expect(blockerLine("no-side")).toBe("Pick UP or DOWN");
  });
});

describe("diagnosis copy (T20)", () => {
  for (const kind of DIAGNOSIS_KINDS) {
    it(`${kind}: write and read bodies ≤ 10 words; a read never says sent or taken`, () => {
      const write = diagnosisCopy(kind);
      const read = readDiagnosisCopy(kind);
      expect(words(write.body), write.body).toBeLessThanOrEqual(10);
      expect(words(read.body), read.body).toBeLessThanOrEqual(10);
      expect(`${read.headline} ${read.body}`).not.toMatch(/\b(sent|taken)\b/i);
      expect(diagnosisCopy(kind, "read")).toEqual(read);
    });
  }

  it("fixes come from the diagnosis", () => {
    expect(fixForDiagnosis("fee-token")).toEqual({ kind: "add-money" });
    expect(fixForDiagnosis("insufficient-collateral")).toEqual({ kind: "add-money" });
    expect(fixForDiagnosis("wrong-chain")).toEqual({ kind: "switch-chain" });
    expect(fixForDiagnosis("rate-limited")).toEqual({ kind: "retry" });
    expect(fixForDiagnosis("rate-limited", false)).toBeNull();
    expect(fixForDiagnosis("not-deployed")).toBeNull();
  });

  it("the boundary body is Owarine-short", () => {
    expect(words(ERROR_BOUNDARY.body)).toBeLessThanOrEqual(10);
    expect(ERROR_BOUNDARY.body).toBe("Only this screen broke. Your money is safe.");
  });

  it("the kit's own words fit", () => {
    expect(words(WAIT.lateTitle)).toBeLessThanOrEqual(5);
    expect(WAIT.lateBody(15)).toBe("No answer after 15s.");
    expect(words(SIGNED_OUT.cta)).toBeLessThanOrEqual(6);
  });
});
