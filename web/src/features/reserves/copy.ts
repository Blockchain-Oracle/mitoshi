/**
 * `/reserves` (R4-12, D-227) — Owarine 90a91d71 `features/earn/copy.ts` (the reserve's own numbers, never projections)
 * and `features/funding/copy.ts` `cc.reserveCovered`, at their word counts or fewer.
 */
/** Which checks could not run (`unavailable`), by the side they need. */
export interface PartialWhy {
  robinhood: boolean;
  base: boolean;
  issuers: boolean;
}

export const RESERVES = {
  title: "Reserves",
  line: "Locked there, minted here.",
  bridge: "Bridge ↗",
  verdict: {
    backed: { kanji: "裏付", romaji: "urazuke", word: "Backed" },
    short: { kanji: "不足", romaji: "fusoku", word: "Short" },
    partial: { kanji: "一部", romaji: "ichibu", word: "Partial" },
  },
  sentence: {
    backed: "Every ticker locks what it owes. Covered.",
    short: "A check failed. See the ticker below.",
    /** Partial says which checks could not run: the Robinhood side, the Base hop, or the issuer scan. */
    partial: (why: PartialWhy) =>
      [why.issuers ? null : "Tempo checks out.", why.robinhood ? "Robinhood side not live yet." : why.base ? "Base hop unread." : null, why.issuers ? "Re-check scans issuers." : null].filter(Boolean).join(" "),
  },
  block: (chain: string, n: string) => `${chain} #${n}`,
  notLiveChain: (chain: string) => `${chain} not live`,
  recheck: "Re-check",
  rechecking: "Re-checking…",
  recheckLabel: "Re-check every chain in this browser",
  steps: { robinhood: "Robinhood", base: "Base", tempo: "Tempo", label: "Chains read" },
  reading: "Reading the chains…",
  unread: "Can't read the chains now.",
  locked: "Locked",
  onTempo: "On Tempo",
  inFlight: "In flight",
  held: "Owed",
  surplus: "Surplus",
  check: "Check",
  ticker: "Ticker",
  notLive: "Not live yet",
  /** `locked` null: the lockbox isn't live, so the row says that rather than "Locked Not live yet" (R4-13). */
  rowSummary: (locked: string | null, onTempo: string) => `${locked === null ? RESERVES.notLive : `${RESERVES.locked} ${locked}`} · ${RESERVES.onTempo} ${onTempo}`,
  status: { pass: "Checks pass", fail: "A check failed" },
  partialStatus: (why: PartialWhy) => (why.robinhood ? "Robinhood side not live" : why.base ? "Base hop unread" : "Issuers not scanned"),
  facts: {
    label: (t: string) => `b${t} facts`,
    lockbox: "Lockbox",
    mirror: "Mirror",
    issuer: "Issuer",
    cap: "Cap",
    paused: "Paused",
    multiplier: "Multiplier",
    synced: "Synced",
    left: "Left today",
    issuerOnly: "Adapter only ✓",
    issuerHolds: "Adapter holds it",
    issuerUnscanned: "full scan on Re-check",
    issuerMissing: "Adapter lacks it ✗",
    issuerOthers: (n: number) => `${n} other holder${n === 1 ? "" : "s"} ✗`,
    no: "No",
    yes: "Yes",
    sendsPaused: "sends paused",
    never: "Never",
    ago: (text: string) => `${text} ago`,
    of: (a: string, b: string) => `${a} of ${b}`,
  },
  history: { title: "30 days", label: "Backing by day", start: "30 days ago", end: "Today", none: "no check", day: (d: string, w: string, n: number) => `${d} · ${w} · ${n} checks` },
  log: { title: "Checks", label: "Re-checks and alerts", empty: "No re-checks yet.", recheck: "Re-check", alert: "Alert", blocks: (t: string) => `Tempo #${t}` },
} as const;
