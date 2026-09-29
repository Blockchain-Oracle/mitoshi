/**
 * The one-ceremony sign-up's words (D-046) and the contextual first-use explainers that replace Masayume's five-step
 * tutorial (68f7a09:web/src/features/onboarding/steps.ts). The tutorial's prose is reused where it still fits —
 * "the price decides, nobody else", the two sides not adding to $1, one spendable number with every other pool
 * labelled beneath it — and rewritten where Somnia facts changed (passkeys, dollars as fees, sponsorship).
 */
export const ONBOARD = {
  eyebrow: "Welcome",
  created: "Your account is ready",
  fundingBody: "One moment — we're adding test dollars. No second prompt: your passkey already proved it's you.",
  funding: "Adding test dollars to your account…",
  fundedBody: "You're funded. Test dollars are play money on Tempo's testnet.",
  failedBody: "Your account is created and safe. Only the test dollars didn't arrive.",
  mainnetBody: "Add dollars to make your first call, or look around first.",
  addDollars: "Add dollars",
  go: "Go to Markets",
  retry: "Try again",
  skip: "Continue without test dollars",
} as const;

export interface Explainer {
  title: string;
  body: string;
}

/** Shown once each, where the question first comes up (not as a wall before the product). */
export const EXPLAINERS = {
  window: {
    title: "How a Window works",
    body: "A Window opens at a price print and settles on the oracle's price at its close — the price decides, nobody else. Pick UP or DOWN; each side has its own live price, so the two don't add up to $1. The ticket shows your cost and the most you can lose before you confirm.",
  },
  money: {
    title: "Where your money sits",
    body: "One number is spendable: what you can use right now. Everything else — cash locked in resting orders, credit waiting in a Window — is labelled beneath it and never added in.",
  },
  keys: {
    title: "Keys you can see and stop",
    body: "Your passkey never leaves your device. When you arm fast trading, a trading key with a daily limit signs for you; this page lists every key, what it may still spend, and stops any of them in one step.",
  },
  stocks: {
    title: "Stock tokens, backed",
    body: "Stock tokens here are bridged from Robinhood Chain. Each ticker shows the tokens locked there against the supply here, as of a block you can check.",
  },
} as const satisfies Record<string, Explainer>;

export type ExplainerId = keyof typeof EXPLAINERS;
