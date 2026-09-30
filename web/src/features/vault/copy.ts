/**
 * The Trading Balance's words (Masayume 68f7a09:web/src/features/vault/copy.ts `VAULT`, with Agari 03b30ab's amount
 * field reasons): the pool-row grammar — label, one sentence on what the pool is FOR and who can move it, then the
 * amount — in dollars, with Tempo's facts (withdrawals are free; deposits and budgets are yours to pay for).
 */
export const VAULT = {
  row: {
    label: "Trading Balance",
    note: "Taps from tap-trading spend from here. Only you can withdraw it — to your own account, any time.",
  },
  cells: { available: "Free", inBudget: "In tap-trading", open: "In open Windows", spentToday: "Spent today" },
  amount: {
    max: "Max",
    notANumber: "Enter an amount like 12.50",
    zero: "Enter an amount above $0",
    overWallet: (held: string) => `Your account holds ${held}`,
    overBalance: (held: string) => `Your Trading Balance has ${held} free`,
    walletHolds: (held: string) => `Account: ${held}`,
    balanceHolds: (held: string) => `Free to withdraw: ${held}`,
  },
  deposit: { label: "Add to the Trading Balance", cta: (amount: string) => `Add ${amount}`, note: "One passkey confirmation; a fraction of a cent in fees." },
  withdraw: { label: "Withdraw to your account", cta: (amount: string) => `Withdraw ${amount}`, note: "Free — we pay the fee. Money in a tap-trading budget comes back when you stop it." },
  receivePolicy: "Your account's receive policy blocks this payment, so nothing moved. Allow the vault in your policy and withdraw again.",
  arm: "Set up tap-trading",
  bets: {
    title: "From your Trading Balance",
    empty: "Nothing traded from the Trading Balance yet.",
    open: "Open",
    settling: "Settling into your Trading Balance…",
    paid: (amount: string) => `${amount} paid into your Trading Balance`,
    lost: "Not this time",
    sold: "Closed before the bell",
    staked: (amount: string) => `staked ${amount}`,
  },
  toasts: { deposited: "Added to your Trading Balance.", withdrawn: "Withdrawn to your account." },
  settledNote: "Settled Windows are paid into your Trading Balance on their own — no prompt, no claim.",
} as const;
