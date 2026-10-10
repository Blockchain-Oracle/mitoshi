// Ported from Masayume 68f7a09:web/src/components/shell/header/nav-items.ts — the one nav registry and its
// route-coverage contract (fidelity list 14), with Stocks, Themes, Bridge, Reserves, Launch and Account added (L-02)
// and discovery consolidated (ux-audit fix 14): rankings merge into "Records", personal history into "History".
// S22 (D-189): the rail's places and the phone dock (Baku/roy-chain's Slush-measured shell) replace the header nav and
// the pill nav; everything else lives in the Everything drawer (the former More panel), one home per destination.
import {
  Activity, ArrowLeftRight, BarChart3, Bell, BookOpen, Bot, Building2, CandlestickChart, ChartCandlestick, ChartLine, ChartNoAxesCombined,
  CircleHelp, Clapperboard, Coins, Dices, Download, GalleryVerticalEnd, Gamepad2, Goal, Handshake, History, KeyRound,
  Layers3, MessageSquare, Mountain, Newspaper, Palette, Presentation, Rocket, ScanSearch, Settings, ShieldCheck, Trophy,
  WalletCards, X as XLogo, type LucideIcon,
} from "lucide-react";
import { DOCS_EXTERNAL, DOCS_URL } from "../../../lib/docs-url";

export type NavItem = {
  id: string;
  name: string;
  href: string;
  description: string;
  icon: LucideIcon;
  external?: boolean;
  beta?: boolean;
  /** Extra words the Everything search matches (ux-audit fix 14). */
  keywords?: string;
  match?: { paths: readonly string[]; exact?: boolean };
};

export type NavSection = { id: string; name: string; description: string; items: readonly NavItem[] };

export type NavGroup = { id: "stocks" | "games" | "build" | "explore"; name: string; description: string; sections: readonly NavSection[] };

const item = (i: NavItem) => i;

export const NAV_ITEMS = {
  trade: item({ id: "trade", name: "Trade", href: "/trade", description: "One screen: a live line, UP or DOWN, one tap.", icon: CandlestickChart, keywords: "terminal chart up down tap btc", match: { paths: ["/trade"] } }),
  markets: item({ id: "markets", name: "Markets", href: "/markets", description: "Call where a price closes.", icon: ChartLine, keywords: "windows up down calls crypto", match: { paths: ["/markets"] } }),
  stocks: item({ id: "stocks", name: "Stocks", href: "/stocks", description: "Buy and sell tokenized stocks on Tempo.", icon: Building2, keywords: "equities shares tsla nvda", match: { paths: ["/stocks"] } }),
  themes: item({ id: "themes", name: "Themes", href: "/themes", description: "Follow a basket an agent rebalances for you.", icon: Palette, keywords: "baskets follow" }),
  bridge: item({ id: "bridge", name: "Bridge", href: "/bridge", description: "Move stock tokens between Robinhood Chain and Tempo.", icon: ArrowLeftRight, keywords: "robinhood layerzero transfer" }),
  reserves: item({ id: "reserves", name: "Reserves", href: "/reserves", description: "Check every bridged token is backed.", icon: ShieldCheck, keywords: "proof backing" }),
  reels: item({ id: "reels", name: "Reels", href: "/reels", description: "Scan market stories quickly.", icon: GalleryVerticalEnd }),
  games: item({ id: "games", name: "Games", href: "/games", description: "Play every market-powered game.", icon: Gamepad2 }),
  gamesHub: item({ id: "games-hub", name: "Games hub", href: "/games", description: "Choose a mode or resume a run.", icon: Gamepad2, match: { paths: ["/games"], exact: true } }),
  practice: item({ id: "practice", name: "Practice", href: "/games/practice", description: "Learn the swipe loop without stakes.", icon: Goal, match: { paths: ["/games/practice"], exact: true } }),
  duel: item({ id: "duel", name: "Duel", href: "/games/duel", description: "Face another player over a live deck.", icon: Handshake, match: { paths: ["/games/duel"] } }),
  lucky: item({ id: "lucky", name: "Lucky", href: "/games/lucky", description: "Let the reel find a live market call.", icon: Dices, match: { paths: ["/games/lucky"], exact: true } }),
  range: item({ id: "range", name: "Range", href: "/games/range", description: "Pick the band where price should finish.", icon: Layers3, match: { paths: ["/games/range"], exact: true } }),
  moonshot: item({ id: "moonshot", name: "Moonshot", href: "/games/moonshot", description: "Aim for a distant price target.", icon: Rocket, match: { paths: ["/games/moonshot"], exact: true } }),
  lineRider: item({ id: "line-rider", name: "Line Rider", href: "/games/line-rider", description: "Ride the line and build a combo.", icon: ChartNoAxesCombined, match: { paths: ["/games/line-rider"], exact: true } }),
  candleHop: item({ id: "candle-hop", name: "Candle Hop", href: "/games/candle-hop", description: "Hop through a candlestick run.", icon: Mountain, match: { paths: ["/games/candle-hop"], exact: true } }),
  portfolio: item({ id: "portfolio", name: "Portfolio", href: "/portfolio", description: "Track positions, money, and activity.", icon: WalletCards, match: { paths: ["/portfolio"], exact: true } }),
  edge: item({ id: "edge", name: "Trader Edge", href: "/portfolio/edge", description: "Review your trading edge report.", icon: ChartCandlestick }),
  gamesHistory: item({ id: "games-history", name: "Games history", href: "/games/history", description: "Every duel and run you played.", icon: History, match: { paths: ["/games/history"], exact: true } }),
  activity: item({ id: "activity", name: "Activity", href: "/activity", description: "Your calls settling, new followers, takes by people you follow.", icon: Activity, keywords: "notifications feed social inbox" }),
  strategies: item({ id: "strategies", name: "Strategies", href: "/strategies", description: "Explore repeatable trading approaches.", icon: Bot, beta: true }),
  agents: item({ id: "agents", name: "Agents", href: "/agents", description: "Copy automated market agents.", icon: Bot }),
  xTrade: item({ id: "x-trade", name: "X-trade", href: "/trade-from-x", description: "Turn a post into a bounded trade.", icon: XLogo }),
  launch: item({ id: "launch", name: "Launch", href: "/launch", description: "Launch a stablecoin or a memecoin.", icon: Rocket, keywords: "token create memecoin stablecoin" }),
  earn: item({ id: "earn", name: "Earn", href: "/earn", description: "Put capital into earning opportunities.", icon: Coins, keywords: "vault yield maker" }),
  parlay: item({ id: "parlay", name: "Parlay", href: "/parlay", description: "Combine several market outcomes.", icon: ChartNoAxesCombined }),
  sensei: item({ id: "sensei", name: "Sensei", href: "/markets?sensei=1", description: "Ask the market assistant.", icon: MessageSquare, keywords: "assistant ai help", match: { paths: [] } }),
  surface: item({ id: "surface", name: "Market Surface", href: "/surface", description: "Read the market structure at a glance.", icon: ScanSearch }),
  leaderboard: item({ id: "leaderboard", name: "Leaderboard", href: "/leaderboard", description: "Verified records, traders and game ranks.", icon: Trophy, keywords: "rank ranking" }),
  gamesRank: item({ id: "games-rank", name: "Game ranks", href: "/games/rank", description: "Season standings for duels.", icon: Trophy, match: { paths: ["/games/rank"], exact: true } }),
  stats: item({ id: "stats", name: "Stats", href: "/stats", description: "Inspect protocol and market activity.", icon: BarChart3 }),
  news: item({ id: "news", name: "News", href: "/news", description: "Follow the stories moving markets.", icon: Newspaper }),
  howItWorks: item({ id: "how-it-works", name: "How it works", href: "/how-it-works", description: "Understand the product from end to end.", icon: CircleHelp }),
  docs: item({ id: "docs", name: "Docs", href: DOCS_URL, external: DOCS_EXTERNAL, description: "Read step-by-step guides and product documentation.", icon: BookOpen }),
  status: item({ id: "status", name: "Status", href: "/status", description: "Check connected services and contracts.", icon: Activity }),
  download: item({ id: "download", name: "Download", href: "/download", description: "Install Mitoshi as an app.", icon: Download, keywords: "install pwa app" }),
  demo: item({ id: "demo", name: "Demo", href: "/demo", description: "Walk through the complete product story.", icon: Clapperboard }),
  pitch: item({ id: "pitch", name: "Pitch", href: "/pitch", description: "Read the concise Mitoshi thesis.", icon: Presentation }),
  account: item({ id: "account", name: "Account & keys", href: "/settings/account", description: "Passkeys, trading keys and grants — see and stop them.", icon: Settings, keywords: "settings revoke passkey security" }),
  notifications: item({ id: "notifications", name: "Notifications", href: "/settings/notifications", description: "Choose what reaches you.", icon: Bell }),
  xRecovery: item({ id: "x-recovery", name: "X recovery", href: "/claim", description: "Recover a trade created from X.", icon: KeyRound }),
} as const satisfies Record<string, NavItem>;

export const STOCKS_GROUP: NavGroup = {
  id: "stocks",
  name: "Stocks",
  description: "Tokenized stocks on Tempo.",
  sections: [{ id: "stocks-trade", name: "Stocks", description: "Buy, follow, move, verify", items: [NAV_ITEMS.stocks, NAV_ITEMS.themes, NAV_ITEMS.bridge, NAV_ITEMS.reserves] }],
};

export const GAMES_GROUP: NavGroup = {
  id: "games",
  name: "Games",
  description: "Practice, predict, or chase an arcade score.",
  sections: [
    { id: "games-start", name: "Start", description: "Choose or learn", items: [NAV_ITEMS.gamesHub, NAV_ITEMS.practice] },
    { id: "games-prediction", name: "Prediction", description: "Market-backed play", items: [NAV_ITEMS.duel, NAV_ITEMS.lucky, NAV_ITEMS.range, NAV_ITEMS.moonshot] },
    { id: "games-arcade", name: "Arcade", description: "Score-only runs", items: [NAV_ITEMS.lineRider, NAV_ITEMS.candleHop] },
  ],
};

export const BUILD_GROUP: NavGroup = {
  id: "build",
  name: "Build",
  description: "Automate and create.",
  sections: [
    { id: "automate", name: "Automate", description: "Playbooks and agents", items: [NAV_ITEMS.strategies, NAV_ITEMS.agents, NAV_ITEMS.xTrade] },
    { id: "create", name: "Create", description: "Launch your own token", items: [NAV_ITEMS.launch] },
  ],
};

/** Records merges the rankings surfaces; History merges the personal-history ones (ux-audit fix 14). */
export const EXPLORE_GROUP: NavGroup = {
  id: "explore",
  name: "Explore",
  description: "Trade tools, records, and product knowledge.",
  sections: [
    { id: "trade", name: "Trade", description: "More ways to make a call", items: [NAV_ITEMS.earn, NAV_ITEMS.parlay, NAV_ITEMS.surface, NAV_ITEMS.sensei] },
    { id: "records", name: "Records", description: "Rankings and market evidence", items: [NAV_ITEMS.leaderboard, NAV_ITEMS.gamesRank, NAV_ITEMS.stats, NAV_ITEMS.activity] },
    { id: "learn", name: "Learn", description: "Guidance and context", items: [NAV_ITEMS.news, NAV_ITEMS.howItWorks, NAV_ITEMS.docs, NAV_ITEMS.status, NAV_ITEMS.download, NAV_ITEMS.demo, NAV_ITEMS.pitch] },
  ],
};

export const HISTORY_SECTION: NavSection = { id: "history", name: "History", description: "Your record", items: [NAV_ITEMS.edge, NAV_ITEMS.gamesHistory] };

export const ACCOUNT_SECTION: NavSection = { id: "account", name: "Account", description: "Keys, alerts and recovery", items: [NAV_ITEMS.account, NAV_ITEMS.notifications, NAV_ITEMS.xRecovery] };

/**
 * The rail's places, in key order (1–5; 6 opens Everything): the terminal first (S23, D-192), both pillars, play, and
 * your money (S22, D-189).
 */
export const RAIL_NAV: readonly NavItem[] = [NAV_ITEMS.trade, NAV_ITEMS.markets, NAV_ITEMS.stocks, NAV_ITEMS.games, NAV_ITEMS.portfolio];

/**
 * The phone dock: four places, then Everything (five slots fit 320 px). Markets — the full list of Windows — is the
 * place the dock leaves out: on a phone it is one tap from the terminal's markets drawer and listed in Everything.
 */
export const DOCK_NAV: readonly NavItem[] = [NAV_ITEMS.trade, NAV_ITEMS.stocks, NAV_ITEMS.games, NAV_ITEMS.portfolio];

/** Rail places the dock leaves out: Everything lists them too, so a phone reaches them (shown at every width). */
export const DOCK_OMITTED: readonly NavItem[] = RAIL_NAV.filter((p) => !DOCK_NAV.includes(p));

/** Everything else, one home each — the right-edge Everything drawer (the former More panel) and ⌘K. */
export const EVERYTHING_SECTIONS: readonly NavSection[] = [
  { id: "more-trade", name: "Trade", description: "Markets and more ways to call", items: [...DOCK_OMITTED, NAV_ITEMS.reels, ...EXPLORE_GROUP.sections[0]!.items] },
  { id: "more-stocks", name: "Stocks", description: "Follow, move, verify", items: [NAV_ITEMS.themes, NAV_ITEMS.bridge, NAV_ITEMS.reserves] },
  ...GAMES_GROUP.sections,
  ...BUILD_GROUP.sections,
  EXPLORE_GROUP.sections[1]!,
  HISTORY_SECTION,
  EXPLORE_GROUP.sections[2]!,
  ACCOUNT_SECTION,
];
export const EVERYTHING_ITEMS: readonly NavItem[] = EVERYTHING_SECTIONS.flatMap((section) => section.items);

/** Every real, user-facing page that must retain an explicit navigation home (the route-coverage contract). */
export const NAVIGABLE_ROUTE_PATHS = [
  "/activity", "/agents", "/bridge", "/claim", "/demo", "/docs", "/download", "/earn", "/games", "/games/candle-hop", "/games/duel",
  "/games/history", "/games/line-rider", "/games/lucky", "/games/moonshot", "/games/practice", "/games/range", "/games/rank",
  "/how-it-works", "/launch", "/leaderboard", "/markets", "/news", "/parlay", "/pitch", "/portfolio", "/portfolio/edge",
  "/reels", "/reserves", "/settings/account", "/settings/notifications", "/stats", "/status", "/stocks", "/strategies",
  "/surface", "/themes", "/trade", "/trade-from-x",
] as const;

export function isActiveNavItem(pathname: string | null, item: NavItem): boolean {
  if (!pathname || item.external) return false;
  const fallbackPath = item.href.split("?")[0] ?? item.href;
  const match = item.match ?? { paths: [fallbackPath] };
  return match.paths.some((path) => pathname === path || (!match.exact && pathname.startsWith(`${path}/`)));
}

/** The top-level routes: below these, the top line shows a back chevron (ux-audit fix 5). */
export function isTopLevel(pathname: string | null): boolean {
  if (!pathname || pathname === "/") return true;
  return pathname.split("/").filter(Boolean).length <= 1;
}

/** Filter for the Everything drawer's search row and ⌘K: name, description and keywords, case-insensitive. */
export function searchNav(items: readonly NavItem[], query: string): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((i) => `${i.name} ${i.description} ${i.keywords ?? ""}`.toLowerCase().includes(q));
}
