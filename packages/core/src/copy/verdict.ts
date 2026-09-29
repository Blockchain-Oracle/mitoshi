// Ported from Masayume 68f7a09:packages/core/src/copy/verdict.ts
export type VerdictOutcome = "win" | "loss" | "void";

export interface VerdictStrings {
  kanji: string;
  romaji: string;
  translation: string;
  /** The subline printed under the stamp. */
  line: string;
}

const VERDICTS: Record<VerdictOutcome, VerdictStrings> = {
  win: { kanji: "正夢", romaji: "masayume", translation: "it came true", line: "masayume — it came true." },
  loss: { kanji: "逆夢", romaji: "sakayume", translation: "a dream that didn't", line: "sakayume — a dream that didn't." },
  void: { kanji: "無効", romaji: "mukō", translation: "void", line: "no reliable print — both sides pay 0.5" },
};

export function verdictStrings(outcome: VerdictOutcome): VerdictStrings {
  return VERDICTS[outcome];
}

/** The one-time screen-reader announcement for a Verdict; `pnlText` is already signed and formatted. */
export function verdictAnnouncement(outcome: VerdictOutcome, pnlText: string): string {
  switch (outcome) {
    case "win":
      return `Masayume — it came true. Won ${pnlText}.`;
    case "loss":
      return `Sakayume — a dream that didn't. Lost ${pnlText}.`;
    case "void":
      return `Void — no reliable print, both sides pay 0.5. Returned ${pnlText}.`;
  }
}
