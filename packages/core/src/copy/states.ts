/**
 * The states kit's own words (R6, D-230): a named wait's late line and Retry, and the signed-out preview's one
 * sign-in. Owarine's word count: a wait is ≤ 4 words and never "Reading …"; a title ≤ 5.
 */
export const WAIT = {
  /** The elapsed seconds after the first 3 s ("4s"). */
  elapsed: (sec: number) => `${sec}s`,
  lateTitle: "Still waiting",
  lateBody: (sec: number) => `No answer after ${sec}s.`,
  retry: "Retry",
} as const;

export const SIGNED_OUT = {
  cta: "Sign in to see yours",
  /** The screen-reader line for the inert preview: whose data it shows. */
  sr: (source: string) => `Preview: ${source}.`,
} as const;
