// Ported from Masayume 68f7a09:packages/markets/src/errors/reading-error.ts
import type { Diagnosis } from "@cwf/core";

/** Thrown when a composed read unwraps an inner error arm; `diagnose()` passes the diagnosis through untouched. */
export class ReadingError extends Error {
  constructor(readonly diagnosis: Diagnosis) {
    super(diagnosis.technical);
    this.name = "ReadingError";
  }
}
