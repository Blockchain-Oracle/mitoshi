/**
 * `/earn` — Owarine 90a91d71 `features/earn/copy.ts` (`EARN`) at its counts (D-224); Mitoshi's words only where Tempo
 * differs: an account and dollars instead of a seat and credits, a passkey instead of a seat, test dollars from the faucet.
 */
export const EARN = {
  /** The hero: "Earn the *spread*." The accented word is the tab's (`reserves.ts`). */
  title: "Earn the",
  tabsLabel: "Reserve",
  panel: {
    /** Tempo: the vault quotes only while the ops earn-quoter key is its maker; with none set it says so. */
    noMaker: "Maker off · no new quotes",
    perShare: "/ share",
    sinceLaunch: "Up from 1.0000 at launch",
    belowLaunch: (noun: string) => `Below 1.0000 — the ${noun} is carrying a loss`,
    utilization: "Utilization",
    loading: "loading the vault…",
  },
  sections: {
    supply: { number: "01" },
    windows: { number: "02", title: "Where the capital is", meta: "one row per Window the maker is on" },
  },
  paused: {
    title: "New deposits are paused",
    body: "The vault's admin has paused new supply. Anything you already supplied is untouched: settlement, merges and withdrawals keep running, and you can withdraw what is idle any time.",
    reserveBody: "The reserve's admin has paused new supply. Anything you already supplied is untouched: live positions settle as they always would, and you can withdraw what no position is holding, any time.",
  },
  supply: {
    amount: "Amount",
    wallet: (balance: string) => `account ${balance}`,
    walletPending: "account …",
    walletReading: "Reading your account balance…",
    max: "Max",
    button: (amount: string) => `Supply ${amount}`,
    /** The sign-in modal's title when the CTA opens it (D-224: the CTA is the action). */
    signInFor: (amount: string) => `to supply ${amount}`,
    paused: "Paused",
    enterAmount: "Enter an amount",
    noFunds: "Nothing in your account. Get test dollars first.",
    over: (held: string) => `Your account holds ${held}`,
    done: "Supplied.",
  },
  position: {
    title: "Your position",
    connect: "Sign in to see it.",
    empty: "Nothing here yet.",
    shares: (shares: string, price: string) => `${shares} shares · at ${price} / share`,
    /** A-2c: realized only. Money already paid back above cost, then what today's share price adds on paper. */
    realizedLabel: "Realized",
    unrealizedLabel: "On paper",
    realized: (amount: string) => `${amount} realized`,
    realizedNone: "Nothing realized yet — a withdrawal returns what you supplied before it returns a profit.",
    unrealized: (amount: string) => `${amount} on paper at today's share price`,
    unrealizedFlat: "Level with what is still in, at today's share price.",
    unrealizedDown: (amount: string) => `${amount} below what is still in, at today's share price`,
    ledgerReading: "Reading what you supplied…",
    withdrawAll: "Withdraw all",
    withdrawIdle: (amount: string) => `Withdraw ${amount} idle`,
    settling: "Settling a closed Window first…",
    printPending: "Waiting for a closed Window's print…",
    printLate: "That Window's closing print hasn't landed yet. Try again in a minute.",
    unsettledNote: "A Window has closed but is not settled yet. Withdrawing settles it first — anyone may.",
    receivePolicy: "Your account's receive policy blocks this payment, so nothing moved. Allow the reserve in your policy and withdraw again.",
    done: "Withdrawn to your account.",
  },
  windows: {
    empty: "The vault holds nothing on any Window. It quotes the live crypto Windows while the maker is on.",
    window: "Window",
    deployed: "Deployed",
    inventory: "Holding",
    state: "State",
    result: "Result",
    resting: "quotes resting",
    paired: (pairs: string) => `${pairs} sets paired · merge`,
    oneSided: (side: string, qty: string) => `${qty} ${side} unpaired`,
    closed: "closed · settle",
    printPending: "closed · print pending",
    settled: "settled",
    merge: "Merge",
    settle: "Settle",
    busy: "Sending…",
    quotes: (n: number) => `${n} quote${n === 1 ? "" : "s"}`,
    reading: "…",
  },
  notDeployed: {
    title: "Earn",
    /** A house reserve not deployed on the network the app is pointed at (the vault's own case is the registered pending page). */
    reserve: (label: string) => `${label} is not on this network yet.`,
  },
} as const;
