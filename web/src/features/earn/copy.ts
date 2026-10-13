/**
 * `/earn` — Owarine 90a91d71 `features/earn/copy.ts` (`EARN`) cut to Owarine's money-screen counts (R4-7, D-227: earn
 * spec copyCuts, copy spec step 7). Mitoshi's words only where Tempo differs: an account and dollars instead of a seat
 * and credits, test dollars from the faucet. A figure says what a sentence used to.
 */
import { TX } from "@/components/tx/copy";

export const EARN = {
  /** The head: "Earn the *spread*." The accented word is the tab's (`reserves.ts`). */
  title: "Earn the",
  tabsLabel: "Reserve",
  card: {
    label: "Reserve",
    loading: "Reading the reserve",
    /** Tempo: the vault quotes only while the ops earn-quoter key is its maker. */
    noMaker: "Maker off",
    paused: "Paused",
    perShare: "/ share",
    fromPar: "from 1.0000",
    atPar: "at par",
    belowPar: "below 1.0000",
    value: "Value",
    idle: "Idle",
  },
  sections: {
    capital: { number: "02", title: "Where the capital is" },
    bounds: { number: "02", title: "What bounds the risk" },
  },
  action: {
    label: "Supply or withdraw",
    supply: "Supply",
    withdraw: "Withdraw",
    /** The phone dock once the card scrolls away. */
    dock: "Supply · Withdraw",
  },
  pad: { group: "Amount keypad", del: "Delete", point: "Point" },
  supply: {
    amount: "Amount to supply",
    wallet: (balance: string) => `account ${balance}`,
    walletReading: "Reading your account…",
    max: "Max",
    button: (amount: string) => `Supply ${amount}`,
    /** The sign-in modal's title when the CTA opens it (D-224: the CTA is the action). */
    signInFor: (amount: string) => `to supply ${amount}`,
    paused: "Supply paused",
    enterAmount: "Enter an amount",
    noFunds: "Get test dollars first",
    over: (held: string) => `Your account holds ${held}`,
    done: "Supplied.",
    receipt: (amount: string) => `Supplied · ${amount}`,
    receiptLabel: "Supplied to the reserve",
  },
  withdraw: {
    amount: "Amount to withdraw",
    idle: (idle: string) => `idle ${idle}`,
    over: (idle: string) => `Only ${idle} is idle`,
    button: (amount: string) => `Withdraw ${amount}`,
    withdrawable: "Withdrawable",
    unsettled: "Settles a closed Window first.",
    settling: "Settling a closed Window…",
    printPending: "Waiting for a Window's print…",
    printLate: "That Window's print hasn't landed. Retry in a minute.",
    receivePolicy: TX.receiveBlocked,
    done: "Withdrawn to your account.",
    receiptLabel: "Shares withdrawn",
    sharesUnit: "shares",
  },
  position: {
    title: "Your position",
    worth: "Worth now",
    onPaper: "On paper",
    costIn: "In",
    realized: "Realized",
    shares: "Shares",
    at: (price: string) => `@ ${price}`,
    /** The ledger can't be read: not known, never a bar that waits forever. */
    unknown: "—",
  },
  windows: {
    capitalLabel: "Vault capital by asset",
    live: "Live",
    settled: "Settled",
    liveCount: (n: number) => `${n} live`,
    settleAll: (n: number) => `Settle ${n}`,
    deployed: "Deployed",
    idle: "Idle",
    other: "Other",
    cap: (pct: string) => `cap ${pct}`,
    empty: "No live Windows.",
    emptySettled: "None settled yet.",
    noMaker: "Maker off",
    inventory: (up: string, down: string) => `${up} UP · ${down} DN`,
    inventoryLabel: "Inventory",
    printPending: "print pending",
    locked: "locked",
    resting: "resting",
    merge: "Merge",
    settle: "Settle",
    signInMerge: "to merge",
    signInSettle: "to settle",
    busy: "Sending…",
    quotes: (n: number) => `${n} quote${n === 1 ? "" : "s"}`,
    reading: "…",
    open: (label: string) => `${label} — the Window's book`,
    book: { out: "Out", back: "Back", merged: "Merged", paid: "Paid", opened: "Opened" },
  },
  bounds: {
    free: "Free",
    capitalLabel: "Reserve capital",
    slots: (open: number, max: number) => `Slots ${open} of ${max}`,
    about: (label: string) => `About ${label}`,
  },
  /** Portfolio's Earn pocket and its line under the money figure (FR-5). */
  pocket: { label: "Earn", note: "Supplied to the vault and reserves.", open: "Open" },
  notDeployed: {
    title: "Earn",
    /** A house reserve not deployed on the network the app is pointed at (the vault's own case is the registered pending page). */
    reserve: (label: string) => `${label} is not on this network yet.`,
  },
} as const;
