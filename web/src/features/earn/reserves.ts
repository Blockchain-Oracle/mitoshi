import type { ReserveKind } from "@cwf/core";

/**
 * Owarine 90a91d71 `features/earn/reserves.ts` — one reserve's words, cut to what a component reads (R4-7, D-227: the
 * panel tags, the committed sentences and the maker's unrendered rows are gone; the bar and its legend say them).
 */
export interface ReserveWords {
  key: ReserveKind;
  /** The tab. */
  label: string;
  /** The head's accented word: what supplying this reserve actually earns. */
  accent: string;
  /** What the reserve is holding against: the card's and the bar's second leg. */
  committed: string;
  /** Shown when a house reserve's contract is not on this network: what it is, in one line (the vault has its pending page). */
  blurb?: string;
  /** Why a supplier can lose money here, in one caption. Never a projected yield. */
  risk: string;
}

const RESERVE_LIST: readonly ReserveWords[] = [
  {
    key: "maker",
    label: "Maker",
    accent: "spread",
    committed: "Deployed",
    risk: "Inventory left at settlement is suppliers' loss.",
  },
  {
    key: "range",
    label: "Range",
    accent: "margin",
    committed: "Locked",
    blurb: "The counterparty to every Range and Moonshot band.",
    risk: "Every band that lands pays out of supply.",
  },
  {
    key: "parlay",
    label: "Parlay",
    accent: "edge",
    committed: "Locked",
    blurb: "Takes every parlay; keeps the stake when a leg misses.",
    risk: "A ticket that hits every leg pays out of supply.",
  },
  {
    key: "boost",
    label: "Boost",
    accent: "premium",
    committed: "Fronted",
    blurb: "Fronts a boost's extra size for a premium up front.",
    risk: "Boosts settling under knock-out cost suppliers.",
  },
];

export const RESERVES: Readonly<Record<ReserveKind, ReserveWords>> = Object.fromEntries(RESERVE_LIST.map((words) => [words.key, words])) as Readonly<Record<ReserveKind, ReserveWords>>;

/** Tab order: the vault that quotes the venue first, then the three house reserves in the order they ship. */
export const RESERVE_TABS: readonly ReserveKind[] = RESERVE_LIST.map((words) => words.key);

export const isReserveKind = (v: unknown): v is ReserveKind => typeof v === "string" && (RESERVE_TABS as readonly string[]).includes(v);
