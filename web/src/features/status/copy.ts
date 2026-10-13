/** `/status` — Owarine 90a91d71 `features/status/copy.ts` (`STATUS.board`), at its counts, for Mitoshi (R4-10, D-227). */
import type { StatusReport, Tone } from "./probes";

export const STATUS = {
  eyebrow: "Mitoshi status",
  /** R6 shell T15: all good says so; otherwise the tally in the owner's form, "17 live · 2 waiting" (live, down, behind, waiting). */
  verdict: (report: Pick<StatusReport, "overall" | "rows">): string => {
    if (report.overall === "healthy") return "All systems live";
    if (report.overall === "unreachable") return "Keepers unreachable";
    return (["good", "bad", "warn", "wait"] as const)
      .map((t) => [t, report.rows.filter((r) => r.tone === t).length] as const)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${n} ${STATUS.tally[t]}`)
      .join(" · ");
  },
  slowest: (part: string, figure: string) => `Slowest: ${part} · ${figure}`,
  allFresh: "Every check fresh.",
  /** The verdict "Keepers unreachable" with no row behind (R4-13: it read "Every check fresh." under it). */
  noAnswer: "No answer from the keepers.",
  head: "Tempo block",
  noHead: "—",
  tally: { bad: "down", warn: "behind", wait: "waiting", good: "live" } satisfies Record<Tone, string>,
  tone: { good: "Running", wait: "Waiting", warn: "Behind", bad: "Not running" } satisfies Record<Tone, string>,
  attention: "Needs attention",
  allChecks: (n: number) => `Every check · ${n}`,
  summary: {
    good: (n: number) => (n === 1 ? "Live" : `All ${n} live`),
    warn: (n: number) => `${n} behind`,
    bad: (n: number) => `${n} down`,
    wait: (n: number) => `${n} waiting`,
  },
  halts: "Halts board →",
  checked: (at: string) => `Checked ${at} · every 30 s`,
  reading: "Reading the keepers…",
} as const;
