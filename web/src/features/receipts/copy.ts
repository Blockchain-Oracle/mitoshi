/** The success receipt after a write (R4-4, D-227; critic gap 21): the toast's words and the sheet's rows. */
export const WRITE_RECEIPT = {
  action: "Receipt",
  title: "Receipt",
  signedBy: "Signed by",
  signer: { passkey: "Passkey", "one-tap": "One-tap key", "trading-balance": "Trading Balance key", wallet: "Your wallet" } as Record<string, string>,
  fee: "Fee",
  sponsored: "No fees to pay",
  selfPaid: "A fraction of a cent",
  tx: "Transaction",
} as const;
