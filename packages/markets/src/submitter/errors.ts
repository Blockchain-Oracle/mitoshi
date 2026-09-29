// Ported from Masayume 68f7a09:packages/markets/src/submitter/errors.ts
import type { Diagnosis, ExitQuote, Quote } from "@cwf/core";

/** A pre-send refusal with its diagnosis: nothing was journaled or signed. */
export class OrderRefusedError extends Error {
  constructor(readonly diagnosis: Diagnosis) {
    super(diagnosis.technical);
    this.name = "OrderRefusedError";
  }
}

/** The fresh quote costs more than the confirmed cap: show it and ask again. */
export class RequoteError extends Error {
  constructor(readonly quote: Quote) {
    super("the fresh quote exceeds the confirmed cost cap");
    this.name = "RequoteError";
  }
}

/** The fresh exit pays less than the confirmed floor. */
export class ExitRequoteError extends Error {
  constructor(readonly exit: ExitQuote) {
    super("the fresh exit pays less than the confirmed floor");
    this.name = "ExitRequoteError";
  }
}
