import type { ReserveKind } from "@cwf/core";

/** Owarine 90a91d71 `features/earn/reserves.ts` — one reserve's words; the brand tags are Mitoshi's. */
export interface ReserveWords {
  key: ReserveKind;
  /** The tab. */
  label: string;
  /** The hero's accented word: what supplying this reserve actually earns. */
  accent: string;
  /** The panel's right-hand tag. */
  brand: string;
  /** The panel's left tag, live and paused. */
  live: string;
  paused: string;
  /** The panel's first metric: "Vault value" for the vault, the reserve's equity for the rest. */
  valueLabel: string;
  /** What this one is called in a sentence: the vault, the reserve. */
  noun: string;
  /** What the reserve is: one sentence, naming where the money comes from. */
  blurb: string;
  /** The §01 head. */
  supplyTitle: string;
  supplyMeta: string;
  /** What "committed" means on this reserve — the panel's second metric and the position card's note. */
  committed: string;
  committedNote: (amount: string) => string;
  /** The same word as a balance-sheet row: what the reserve is holding it against. */
  committedRow: string;
  /** The §02 head: the tunables the deployed reserve carries. */
  boundsTitle: string;
  boundsMeta: string;
  /** Why a supplier can lose money here. Never an APY. */
  risk: string;
}

const RESERVE_LIST: readonly ReserveWords[] = [
  {
    key: "maker",
    label: "Maker vault",
    accent: "spread",
    brand: "Mitoshi MM",
    live: "Live · maker vault",
    paused: "Paused · maker vault",
    valueLabel: "Vault value",
    noun: "vault",
    blurb: "The vault quotes both sides of the venue's own Windows with its suppliers' cash and earns the gap between them.",
    supplyTitle: "Supply the vault",
    supplyMeta: "withdraw what is idle, any time",
    committed: "Deployed",
    committedNote: (amount) => `${amount} of your position is deployed on live Windows, counted at cost, or at nothing once a Window resolves against it. It comes back as they settle; withdraw the rest then.`,
    committedRow: "Capital locked in quotes or held as positions on live Windows, counted at cost and never above it: at nothing once a Window resolves against the vault. It returns as each Window settles.",
    boundsTitle: "What bounds the risk",
    boundsMeta: "the deployed vault's own parameters",
    risk: "The vault is holding inventory when a Window settles against its quotes, and that loss is the suppliers'.",
  },
  {
    key: "range",
    label: "Range & Moonshot",
    accent: "margin",
    brand: "Mitoshi RANGE",
    live: "Live · range reserve",
    paused: "Paused · range reserve",
    valueLabel: "Reserve value",
    noun: "reserve",
    blurb: "The reserve is the counterparty to every band: it prices off the Window's own opening print, takes the stake, and locks the payout until the closing print lands.",
    supplyTitle: "Supply the reserve",
    supplyMeta: "withdraw what no live band is holding",
    committed: "Locked",
    committedNote: (amount) => `${amount} of your position is locked behind live bands. It comes back as they settle; withdraw the rest then.`,
    committedRow: "Capital locked behind live bands. Each band releases what it does not pay when its Window's closing print lands.",
    boundsTitle: "What bounds the risk",
    boundsMeta: "the deployed reserve's own parameters",
    risk: "Every band that lands inside pays its owner out of supplier capital; the margin is what the reserve keeps for taking that side.",
  },
  {
    key: "parlay",
    label: "Parlay",
    accent: "edge",
    brand: "Mitoshi PARLAY",
    live: "Live · parlay reserve",
    paused: "Paused · parlay reserve",
    valueLabel: "Reserve value",
    noun: "reserve",
    blurb: "Every leg is priced off the venue's price ladder, with a floor for legs that settle at the same instant. The reserve keeps the stake when a ticket misses a leg.",
    supplyTitle: "Supply the reserve",
    supplyMeta: "withdraw what no live ticket is holding",
    committed: "Locked",
    committedNote: (amount) => `${amount} of your position is locked behind live tickets. It comes back as they settle; withdraw the rest then.`,
    committedRow: "Capital locked behind live tickets. A ticket releases what it does not pay as its last leg resolves.",
    boundsTitle: "What bounds the risk",
    boundsMeta: "the deployed reserve's own parameters",
    risk: "A ticket that hits every leg is paid in full out of supplier capital — rare, and large when it happens.",
  },
  {
    key: "boost",
    label: "Boost",
    accent: "premium",
    brand: "Mitoshi BOOST",
    live: "Live · boost reserve",
    paused: "Paused · boost reserve",
    valueLabel: "Reserve value",
    noun: "reserve",
    blurb: "The reserve fronts the difference between a boosted stake and the contracts it buys, and takes a premium for it up front.",
    supplyTitle: "Supply the reserve",
    supplyMeta: "withdraw what no live boost is holding",
    committed: "Fronted",
    committedNote: (amount) => `${amount} of your position is fronted on live boosts. It comes back as they close, knock out or settle; withdraw the rest then.`,
    committedRow: "Capital fronted on live boosts. It returns when a position is closed, knocked out or settled.",
    boundsTitle: "What bounds the risk",
    boundsMeta: "the deployed reserve's own parameters",
    risk: "A boost that settles under its knock-out line before the keeper reaches it leaves the fronted capital short, and that shortfall is the suppliers'.",
  },
];

export const RESERVES: Readonly<Record<ReserveKind, ReserveWords>> = Object.fromEntries(RESERVE_LIST.map((words) => [words.key, words])) as Readonly<Record<ReserveKind, ReserveWords>>;

/** Tab order: the vault that quotes the venue first, then the three house reserves in the order they ship. */
export const RESERVE_TABS: readonly ReserveKind[] = RESERVE_LIST.map((words) => words.key);
