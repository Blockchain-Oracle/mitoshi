// The automate surfaces' words (R4-6, D-227): Owarine 90a91d71 `features/strategies/copy.ts`'s register at its word
// count or fewer — a figure or a chip carries what a sentence used to. planCopy's reasons (`COPY.form`, `.plan`,
// `.blocked`) keep their wording: they are the one line under a blocked button.
import { formatBaseUnits, USD_DECIMALS } from "@cwf/core";
import { centsOf, usdCap } from "./format";

const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const STRATEGIES = {
  title: "Give your strategy a life.",
  views: [
    { value: "create", label: "Create" },
    { value: "copy", label: "Copy a strategy" },
    { value: "yours", label: "Your strategies" },
  ] as const,
  viewsLabel: "Strategy workspace",
  board: "Agents board →",
  loading: "Reading the registry",
  error: "The strategies couldn't be read just now.",
  retry: "Try again",
  notDeployed: "The strategy registry isn't on this network yet.",
  advice: "Testnet money. Strategies can lose. Not advice.",
  yours: {
    signedOutTitle: "Your strategies, in one place.",
    unreadable: "Your copies couldn't be read just now.",
    signIn: "Sign in",
    emptyTitle: "No strategies here yet.",
    create: "Create one →",
  },
  archive: {
    title: "Published strategies",
    count: (n: number) => `${n} published`,
    show: (n: number) => `Show · ${n}`,
    hide: "Hide",
    none: "No strategies published yet.",
    noTab: (tab: string) => `None match “${tab}”.`,
  },
  tabs: { all: "All", settled: "Settled", agents: "Agents", memory: "Memory", copied: "Most copied", safest: "Safest", new: "New" },
  tiers: { settled: (n: number) => `Settled · ${n}`, active: (open: number) => `Active · ${open} open`, copying: (n: number) => `${n} copying`, fresh: "New" },
  card: {
    max: "max",
    netMeta: (n: number) => `net · ${n} settled`,
    agent: (id: string) => `ERC-8004 #${id}`,
    memory: (price: bigint) => (price > 0n ? `◈ memory · ${usd(price)}` : "◈ memory"),
    foot: (fee: bigint, copiers: number) => `${fee === 0n ? "free" : `${usdCap(fee)} fee`}${copiers > 0 ? ` · ${plural(copiers, "copier")}` : ""}`,
    copy: "Copy",
    copying: "Copying",
    fading: "Fading",
    closed: "Closed",
  },
  health: { alive: "Live", stale: "Quiet", "never-started": "Not started", unknown: "Unknown" },
  recent: { title: "Recent copy trades", empty: "No copy trades yet.", copied: (n: number) => `×${n}`, fade: "fade", open: "open" },
  record: {
    title: "Track record",
    meta: (n: number) => plural(n, "trade"),
    winRate: "win rate",
    won: "Won",
    lost: "Lost",
    net: "Net",
    curveEmpty: "No settled trades",
    curve: (dir: "up" | "down", amount: string) => `Net ${dir} $${amount}`,
  },
};

export const COPY = {
  tabs: { copy: "Copy", yours: "Your copy", decisions: "Decisions", memory: "Memory" },
  tabsLabel: "Strategy",
  /** "$5 / trade · $50 / day · 3 open · ≤ 90¢". */
  limits: (perTrade: bigint, daily: bigint, open: number, priceRaw: bigint) =>
    `${usdCap(perTrade)} / trade · ${usdCap(daily)} / day · ${open} open${priceRaw > 0n ? ` · ≤ ${centsOf(priceRaw)}` : ""}`,
  direction: { label: "Direction", follow: "Follow", fade: "Fade" },
  strip: { label: "Your money", wallet: "Wallet", balance: "Trading Balance", takes: "This takes" },
  /** `left` is null in privacy mode: the pill keeps its words without the figure. */
  share: { use: (left: bigint | null) => (left === null ? "Use my budget" : `Use my budget · ${usdCap(left)} left`), fresh: "New budget" },
  rows: {
    deposit: "Wallet → Balance",
    runner: "Runner",
    runnerValue: (budget: bigint, perTrade: bigint, days: number) => `${usdCap(budget)} · ${usdCap(perTrade)}/trade · ${days}d`,
    shared: "Shared budget",
    keeps: "Keeps",
    stops: "Stops",
    fee: "Fee",
    free: "Free",
    signatures: "Signatures",
  },
  /** The CTA keeps its amount signed in or out; signed out it opens sign-in with this intent. */
  cta: (mode: "follow" | "fade", amount: bigint | null) => `${mode === "fade" ? "Fade" : "Copy"}${amount !== null && amount > 0n ? ` · ${usdCap(amount)}` : ""}`,
  intent: (cta: string, name: string) => `${cta.split(" · ")[0]} ${name}${cta.includes(" · ") ? ` · ${cta.split(" · ")[1]}` : ""}`,
  form: {
    budget: "Budget",
    perTrade: "Per trade",
    max: "Max",
    notANumber: "Enter an amount like 10 or 2.50.",
    walletShort: (have: bigint | null, need: bigint) => (have === null ? `This needs ${usd(need)}, more than your wallet holds.` : `Your wallet has ${usd(have)}; this needs ${usd(need)}.`),
    aboveStrategy: (max: bigint) => `This strategy allows at most ${usd(max)} a trade.`,
    aboveBudget: "Can't be more than the budget.",
  },
  plan: {
    otherRunner: "Your live copy budget is for another runner.",
    capsTooWide: "Your live copy budget's limits are wider than this strategy allows.",
  },
  blocked: {
    signIn: "Sign in to copy",
    busy: "Working…",
    inactive: "This strategy is closed to new copiers",
    checking: "Checking your balances…",
    funding: "Funding your account…",
    noBudget: "Enter a budget",
    noPerTrade: "Enter the most per trade",
  },
  manage: {
    receiptLabel: "Strategy",
    live: "Copying",
    fading: "Fading",
    notLive: "Paused · budget not live",
    pnl: "Your result",
    noFills: "No trades for you yet.",
    sample: (settled: number, open: number) => `${plural(settled, "settled", "settled")}${open > 0 ? ` · ${open} open` : ""}`,
    feePaid: (base: bigint) => `fee ${usd(base)}`,
    switchTo: (mode: "follow" | "fade") => `Switch to ${mode} · free`,
    renew: "Renew its budget",
    stop: "Hold to stop",
    stopConfirm: "Stopping",
  },
  done: { copied: "Copying.", stopped: "Stopped.", switched: "Switched." },
  runner: (a: string) => `Runner ${a.slice(0, 6)}…${a.slice(-4)}`,
};
