// The agents board's and cockpit's words (R4-6, D-227): Owarine 90a91d71's board and desk cockpit at its word count or
// fewer — figures in cells, labels on chips; the inherited order is a tab ("Capital", titled "By capital entrusted").
import { formatBaseUnits, USD_DECIMALS } from "@cwf/core";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = (base: bigint) => `$${formatBaseUnits(base < 0n ? -base : base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

export const AGENTS = {
  title: "Agent leaderboard",
  entry: { create: "Create an agent →", copy: "Copy a strategy →", yours: "Your strategies →" },
  entryLabel: "Agent actions",
  stats: { agents: "Agents", strategies: "Strategies", copiers: "Copiers", entrusted: "Entrusted" },
  sortLabel: "Order",
  sorts: [
    { value: "inherited", label: "Most backed", title: "By capital entrusted, then copy trades — not results" },
    { value: "pnl", label: "P&L", title: "By settled P&L" },
  ] as const,
  loading: "Reading the agents",
  error: "The agents couldn't be read just now.",
  retry: "Try again",
  notDeployed: "The strategy registry isn't on this network yet.",
  empty: "No agents yet.",
  emptyCta: "Create one →",
  top: "Top",
  byline: (copiers: number, trades: number) => `${plural(copiers, "copier")} · ${plural(trades, "trade")}`,
  cells: { entrusted: "Entrusted", net: "Net", max: "Max / trade", last: "Last active" },
  settled: (n: number) => `${n} settled`,
  net: (net: bigint, settled: number) => (settled === 0 ? "—" : `${net > 0n ? "+" : net < 0n ? "−" : ""}${usd(net)}`),
  advice: "Test money. Strategies can lose. Not advice.",
  cockpit: {
    back: "All agents",
    eyebrow: (agentId: string | null, series: string | null) => `${agentId ? `AGENT #${agentId}` : "STRATEGY"} · ${series ?? "ANY WINDOW"}`,
    copy: "Copy",
    copying: "Copying",
    more: "More",
    report: "Report",
    block: "Block creator",
    share: "Share",
    blocked: "Blocked.",
    shared: "Link copied.",
    hero: { title: "Net", ranges: { "1d": "1D", "1w": "1W", all: "All" } as Record<string, string>, rangesAria: "Range", winRate: "Win rate", settled: "Settled", open: "Open", none: "No settled trades yet." },
    next: { title: "Next read", in: (s: string) => `in ${s}`, now: (s: string) => `Reading now · ${s} left`, none: "No live Window", beat: (age: string) => `Heartbeat ${age}`, noBeat: "No heartbeat yet", due: "Due now", late: "Runner late", report: "Runner report" },
    tabs: { overview: "Overview", decisions: "Decisions", copies: "Copies", identity: "Identity" },
    tabsLabel: "Agent",
    latest: "Latest decision",
    limits: "Its limits",
    yours: "Your copy",
    filters: { all: "All", bet: "Bet", held: "Held", failed: "Failed" } as Record<string, string>,
    noDecisions: "No decisions yet.",
    noFills: "No copy trades yet.",
    identity: "ERC-8004 identity",
    registry: "Registry",
    ratings: "Ratings",
    noRatings: "No ratings yet.",
    ratingCount: (n: number) => plural(n, "rating"),
    memory: "Sealed memory",
    notFound: "No such agent.",
  },
};
