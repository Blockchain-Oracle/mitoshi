/** The TxLifecycle family's words (D-045 grammar: the CTA names its blocker; failures say whether money moved). */
export const TX = {
  signingPasskey: "Confirm with your passkey…",
  signingKey: "Signing with your trading key…",
  signingWallet: "Confirm in your wallet…",
  submitted: "Sent — waiting for the chain",
  confirmedPending: "Confirmed",
  confirmed: "Confirmed",
  unknown: "Waiting for the chain to answer",
  unknownBody: "Waiting on the chain. Nothing is re-sent.",
  scheduled: (sec: number) => `Starting in ${sec}s`,
  undo: "Undo",
  moneyMoved: {
    no: "Nothing was taken.",
    yes: "Money moved — your receipt shows where.",
    unknown: "Waiting on the chain. Nothing is re-sent.",
  },
  retry: "Try again",
  technical: "Technical details",
  noFees: "No fees to pay",
  chips: { signing: "Signing", submitted: "Sent", confirmed: "Confirmed" },
  progress: "Progress",
  /** The CTA's face once confirmed, where no receipt takes its place. */
  confirmedDone: "Confirmed ✓",
  /** What an `unknown` write promises under the CTA. */
  notResent: "Nothing is re-sent.",
  another: "Place another",
  transaction: "Transaction",
  typedConfirm: (code: string) => `Type ${code} to confirm`,
  typedMismatch: "That doesn't match yet.",
  keyUsed: {
    title: "Signed by your trading key",
    left: (left: string, limit: string) => `${left} of ${limit} left this period`,
    expires: (when: string) => `Key expires ${when}`,
    manage: "Manage keys",
  },
  explorer: "View on the explorer",
  // The shared short lines every ticket and receipt says the same way (R4-2, D-227; Owarine 90a91d71 vault/copy.ts is
  // the model): one line each, at Owarine's word count.
  payoutSetAside: "Payout set aside up front · no fees.",
  receiveBlocked: "Your receive policy blocks this. Nothing moved.",
  held: (amount: string) => `${amount} held — collect once your policy allows.`,
  requote: (cost: string) => `Price moved: now ${cost}. Hold again to place.`,
  voidReturned: "Voided — your stake is back.",
} as const;
