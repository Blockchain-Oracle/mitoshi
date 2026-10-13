/**
 * The Trading Balance's words (Masayume 68f7a09:web/src/features/vault/copy.ts `VAULT`, with Agari 03b30ab's amount
 * field reasons): the pool-row grammar — label, one sentence on what the pool is FOR and who can move it, then the
 * amount — in dollars, with Tempo's facts (withdrawals are free; deposits and budgets are yours to pay for).
 */
export const VAULT = {
  row: {
    label: "Trading Balance",
    note: "Taps spend from here. Only you withdraw.",
  },
  cells: { available: "Free", inBudget: "In tap-trading", open: "In open Windows", spentToday: "Spent today" },
  amount: {
    label: "Amount",
    max: "Max",
    notANumber: "Enter an amount like 12.50",
    zero: "Enter an amount above $0",
    overWallet: (held: string) => `Your account holds ${held}`,
    overBalance: (held: string) => `Your Trading Balance has ${held} free`,
    over: "More than your account and your free balance",
    hint: (account: string, free: string) => `Account ${account} · Free ${free}`,
  },
  deposit: { cta: (amount: string) => `Add ${amount}`, busy: "Adding…" },
  withdraw: { cta: (amount: string) => `Withdraw ${amount}`, busy: "Withdrawing…" },
  fee: "Adding costs a cent. Withdrawing is free.",
  receivePolicy: "Your account's receive policy blocks this payment, so nothing moved. Allow the vault in your policy and withdraw again.",
  arm: "Set up tap-trading",
  toasts: { deposited: (amount: string) => `Added · ${amount}`, withdrawn: (amount: string) => `Withdrawn · ${amount}` },
  receipt: { deposited: "Added to your Trading Balance", withdrawn: "Withdrawn to your account" },
  legacy: {
    title: "Your previous Trading Balance",
    body: (held: string) => `Mitoshi moved to a new Trading Balance. The previous one still holds ${held}: withdraw it to your account, then add it here when you like.`,
    key: (budget: string) => `An old tap-trading key there still holds ${budget}. Stop it to move that back first.`,
    stop: "Stop the old key",
    withdraw: (amount: string) => `Withdraw ${amount}`,
    stopped: "Old key stopped — its budget is back in the previous balance.",
    withdrawn: "Withdrawn from the previous Trading Balance to your account.",
  },
} as const;
