// The desk's words (S9.7): Agari 03b30ab `features/strategies/copy.ts`'s register — what a strategy does, its record
// with its sample size, what one signature does — adapted to Tempo (one transaction, the Trading Balance, ERC-8004).
import { formatBaseUnits, USD_DECIMALS } from "@cwf/core";

const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const STRATEGIES = {
  eyebrow: "Strategies · testnet",
  title: "Copy a strategy, or launch your own.",
  lead: "Each strategy is published on chain with hard limits. Copying it lets its runner trade for you only inside a budget and caps you sign once — and you can stop it in one tap.",
  views: [
    { value: "copy", label: "Copy" },
    { value: "yours", label: "Yours" },
    { value: "create", label: "Create" },
  ] as const,
  viewsLabel: "Strategy workspace",
  loading: "Reading the registry",
  error: "The strategies couldn't be read just now.",
  retry: "Try again",
  notDeployed: "The strategy registry isn't on this network yet.",
  empty: "No strategies are published yet.",
  yoursSignedOut: "Sign in to see what you copy and what you published.",
  yoursEmpty: "You haven't copied or published a strategy yet.",
  disclosure:
    "Testnet: test money, real transactions. A strategy's record is its own calls as the chain settled them — losses always counted. Past results say nothing certain about the next Window. You can lose what you put in.",
  card: {
    agent: (id: string) => `ERC-8004 agent #${id}`,
    house: "House",
    free: "Free to copy",
    fee: (base: bigint) => `${usd(base)} to copy`,
    copiers: (n: number) => plural(n, "copier"),
    perTrade: (base: bigint) => `≤ ${usd(base)} a trade`,
    series: (label: string | null) => label ?? "Any Window",
    noRecord: (open: number) => (open > 0 ? `No settled trades yet · ${open} open` : "No trades yet"),
    net: (base: bigint) => `${base >= 0n ? "+" : "−"}${usd(base < 0n ? -base : base)}`,
    sample: (settled: number, wins: number, losses: number) => `${plural(settled, "settled", "settled")} · ${wins}W ${losses}L`,
    closed: "Closed to new copiers",
  },
  health: {
    alive: "Runner live",
    stale: "Runner quiet",
    "never-started": "Runner not started",
    unknown: "Runner status unknown",
  },
  toggle: { copy: "Copy", copying: "Copying", stop: "Stop", fading: "Fading" },
  recent: { title: "Recent copy trades", empty: "No copy trades yet — the runner places one when a strategy's trigger fires for a live copier.", faded: "fade" },
};

export const COPY = {
  drawerTitle: (name: string) => name,
  what: "What it does",
  limits: "Its hard limits",
  limitsLine: (perTrade: bigint, daily: bigint, open: number, priceRaw: bigint) =>
    `At most ${usd(perTrade)} a trade and ${usd(daily)} a day, ${plural(open, "Window")} at once${priceRaw > 0n ? `, never above ${Number(priceRaw / 10_000n)}¢ a side` : ""}. Enforced by your Trading Balance, not by trust.`,
  record: "Its record",
  runner: "Its runner",
  runnerKey: (a: string) => `Runner ${a.slice(0, 6)}…${a.slice(-4)}`,
  agentReads: "Its last reads",
  feedback: (count: number, mean: string | null) => (count === 0 ? "No ERC-8004 feedback yet" : `${plural(count, "rating")} on ERC-8004 · mean ${mean ? Number(mean).toFixed(2) : "—"}`),
  mode: {
    label: "How to copy",
    options: [
      { value: "follow", label: "Follow" },
      { value: "fade", label: "Fade" },
    ] as const,
    followHelp: "Takes the side the strategy calls.",
    fadeHelp: "Takes the opposite side of every call — you win when it loses.",
  },
  route: {
    label: "Budget",
    options: [
      { value: "share", label: "Use my copy budget" },
      { value: "new", label: "Set a new budget" },
    ] as const,
    share: (left: bigint, perTrade: bigint) => `Shares your live copy budget: ${usd(left)} left, ${usd(perTrade)} a trade. Nothing moves.`,
  },
  form: {
    budget: "Budget",
    budgetHelp: "What the runner may spend in total, from your Trading Balance.",
    perTrade: "Most per trade",
    perTradeHelp: (max: bigint) => `Up to ${usd(max)} — the strategy's own ceiling.`,
    notANumber: "Enter an amount like 10 or 2.50.",
    walletShort: (have: bigint, need: bigint) => `Your wallet has ${usd(have)}; this needs ${usd(need)}.`,
    aboveStrategy: (max: bigint) => `This strategy allows at most ${usd(max)} a trade.`,
    aboveBudget: "Can't be more than the budget.",
  },
  plan: {
    otherRunner: "Your live copy budget is for another runner.",
    capsTooWide: "Your live copy budget's limits are wider than this strategy allows.",
    deposit: (base: bigint) => `Moves ${usd(base)} from your wallet into your Trading Balance.`,
    grant: (budget: bigint, perTrade: bigint, days: number) => `Lets its runner spend up to ${usd(budget)}, ${usd(perTrade)} a trade, for ${days} days.`,
    fee: (base: bigint) => (base === 0n ? "No fee." : `Pays the creator ${usd(base)} once.`),
    carried: (names: string[]) => `Keeps ${names.join(", ")} running on the new budget.`,
    stops: (names: string[]) => `Stops ${names.join(", ")} — that budget is for another runner.`,
    oneSignature: "One signature. You pay the network fee.",
  },
  blocked: {
    signIn: "Sign in to copy",
    busy: "Working…",
    inactive: "This strategy is closed to new copiers",
    checking: "Checking your balances…",
    noBudget: "Enter a budget",
    noPerTrade: "Enter the most per trade",
  },
  cta: (mode: "follow" | "fade") => (mode === "fade" ? "Fade this strategy" : "Copy this strategy"),
  manage: {
    live: "Copying now",
    notLive: "Copy paused — its budget isn't live",
    mode: (mode: "follow" | "fade") => (mode === "fade" ? "Fading it" : "Following it"),
    switchTo: (mode: "follow" | "fade") => (mode === "fade" ? "Switch to fade" : "Switch to follow"),
    switchHelp: "No fee — you're already subscribed.",
    renew: "Give it a budget again",
    stop: "Hold to stop copying",
    stopConfirm: "Stopping",
    stopHelp: (sharing: boolean) => (sharing ? "Ends this copy; your budget keeps serving your other copies." : "Ends this copy and returns its unspent budget to your Trading Balance. No fee."),
    pnl: "Your result from it",
    pnlLine: (net: bigint, settled: number, open: number) => `${usd(net < 0n ? -net : net)} ${net < 0n ? "down" : "up"} over ${plural(settled, "settled trade")}${open > 0 ? ` · ${open} open` : ""}`,
    noFills: "No trades for you yet — it places one when its trigger fires.",
  },
  done: { copied: "You're copying it. Its next call carries you.", stopped: "Stopped. Nothing more will be placed for you.", switched: "Switched." },
};
