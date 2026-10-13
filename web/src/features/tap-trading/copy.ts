/**
 * Tap-trading with the wallet-mode key (D-047) — Masayume's arm grammar (68f7a09:web/src/features/session/copy.ts
 * `modal`: one lead sentence, the facts, the skip line), with this key's facts: it counts new approvals against a
 * daily limit ("up to $25 of new approvals a day", D-138), lives 24 hours, and can only trade on the engine.
 */
export const TAP = {
  eyebrow: "Tap-trading · trading key",
  title: "Arm tap-trading",
  lead: "Arm tap-trading once, and your calls sign with no prompt.",
  // R4-3 (D-227), copy spec: Owarine's word count — the scope, the never and the fees sit in the receipt below.
  facts: (limit: string, hours: number) => `${limit} a day for ${hours} h — calls, cash-outs, collects. Never withdraws.`,
  sponsored: "No fees — we pay the network fee.",
  receipt: {
    title: "What you are signing",
    scope: "Can",
    scopeValue: "Place calls, cash out, collect",
    never: "Never",
    neverValue: "Withdraw or send your money elsewhere",
    limit: "Limit",
    limitValue: (limit: string, hours: number) => `${limit} of new approvals a day, ${hours} h`,
    fees: "Fees",
    feesValue: "None — we pay the network fee",
  },
  skip: "Skip it, and every call simply asks your passkey instead.",
  cta: "Arm tap-trading",
  busy: "Confirm with your passkey…",
  armed: "Tap-trading is on.",
  armedBody: (_limit: string, until: string) => `No prompts until ${until}. Stop it in Account.`,
  manage: "Manage keys",
  failed: "Didn't turn on. Nothing was taken.",
  aborted: "No key was made. Every call will ask your passkey.",
  retry: "Try again",
  chip: {
    on: "tap-trading on",
    off: "tap-trading",
    titleOn: (limit: string, until: string) => `No prompts · ${limit} a day · until ${until}`,
    titleOff: "Arm popup-free calls: one passkey prompt now, none per call.",
    titleUnavailable: "Tap-trading needs a passkey account; this wallet signs each call itself.",
  },
  pendingOnChain: "Armed · live with your first call.",
} as const;
