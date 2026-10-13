// The verdict's grade, pure (R6 shell T15), so the page, the route and the chip read one rule and it can be tested.
import type { StatusReport, StatusRow } from "./probes";

/**
 * The verdict (R6 shell T15; Owarine 90a91d71 `features/status/grade.ts` `worst()` and its "a warning is not all systems
 * live" rule): a critical row down or any row behind is degraded, any row waiting is waiting, else healthy. It used to
 * say healthy while two rows were behind.
 */
export function overallOf(rows: readonly Pick<StatusRow, "id" | "tone">[], _critical?: ReadonlySet<string>): StatusReport["overall"] {
  if (rows.some((r) => r.tone === "warn" || r.tone === "bad")) return "degraded";
  if (rows.some((r) => r.tone === "wait")) return "waiting";
  return "healthy";
}

/** The chip's word off the same rows: the worst tone alone, with its count. */
export function worstTally(rows: readonly Pick<StatusRow, "tone">[]): { tone: "bad" | "warn" | "wait"; n: number } | null {
  for (const tone of ["bad", "warn", "wait"] as const) {
    const n = rows.filter((r) => r.tone === tone).length;
    if (n) return { tone, n };
  }
  return null;
}
