/** `/status` — Owarine 90a91d71 `features/status/copy.ts` (`STATUS.board`), at its counts, for Mitoshi (R4-10, D-227). */
import type { StatusReport, Tone } from "./probes";

export const STATUS = {
  eyebrow: "Mitoshi status",
  verdict: { healthy: "All systems live", degraded: "Running degraded", unreachable: "Keepers unreachable" } satisfies Record<StatusReport["overall"], string>,
  slowest: (part: string, figure: string) => `Slowest: ${part} · ${figure}`,
  allFresh: "Every check fresh.",
  /** The verdict "Keepers unreachable" with no row behind (R4-13: it read "Every check fresh." under it). */
  noAnswer: "No answer from the keepers.",
  head: "Tempo block",
  noHead: "—",
  tally: { bad: "down", warn: "behind", good: "live" } satisfies Record<Tone, string>,
  tone: { good: "Running", warn: "Behind", bad: "Not running" } satisfies Record<Tone, string>,
  attention: "Needs attention",
  allChecks: (n: number) => `Every check · ${n}`,
  summary: {
    good: (n: number) => (n === 1 ? "Live" : `All ${n} live`),
    warn: (n: number) => `${n} behind`,
    bad: (n: number) => `${n} down`,
  },
  halts: "Halts board →",
  checked: (at: string) => `Checked ${at} · every 30 s`,
  reading: "Reading the keepers…",
} as const;
