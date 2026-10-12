// Ported from Masayume 68f7a09:web/src/components/shell/header/nav-items.ts — the one nav registry and its
// route-coverage contract (fidelity list 14). Round 3 (D-226): Owarine 90a91d71 `components/shell/nav.ts`'s map — six
// places (Trade · Markets · Portfolio · Games · Automate · Leaderboard), the dock, and More, one home per destination.
// No Stocks place: stocks trade in Markets' 24/7 lanes beside crypto and each ticker's hub is `/tickers/[symbol]`.
import {
  Activity, ArrowLeftRight, BarChart3, Bell, BookOpen, Bot, CandlestickChart, CirclePause, ChartCandlestick, ChartLine, ChartNoAxesCombined,
  CircleHelp, Clapperboard, Coins, Dices, Download, GalleryVerticalEnd, Gamepad2, Goal, Handshake, History, KeyRound,
  Layers3, MessageSquare, Mountain, Newspaper, Palette, Presentation, Rocket, ScanSearch, Settings, ShieldCheck, Sparkles, Trophy,
  WalletCards, X as XLogo, type LucideIcon,
} from "lucide-react";
import { DOCS_EXTERNAL, DOCS_URL } from "../../../lib/docs-url";

export type NavItem = {
  id: string;
  name: string;
  href: string;
  /** One short line: what you do there (tooltips, ⌘K, More). */
  description: string;
  icon: LucideIcon;
  external?: boolean;
  beta?: boolean;
  /** Extra words the More search matches (ux-audit fix 14). */
  keywords?: string;
  match?: { paths: readonly string[]; exact?: boolean };
};

export type NavSection = { id: string; name: string; items: readonly NavItem[] };

const item = (i: NavItem) => i;

export const NAV_ITEMS = {
  trade: item({ id: "trade", name: "Trade", href: "/trade", description: "One tap Up or Down on a live chart.", icon: CandlestickChart, keywords: "terminal chart up down tap btc", match: { paths: ["/trade"] } }),
  markets: item({ id: "markets", name: "Markets", href: "/markets", description: "Every live Window, coin and stock.", icon: ChartLine, keywords: "windows up down calls crypto stocks equities shares tsla nvda", match: { paths: ["/markets", "/tickers"] } }),
  portfolio: item({ id: "portfolio", name: "Portfolio", href: "/portfolio", description: "Your money, positions and record.", icon: WalletCards, match: { paths: ["/portfolio"], exact: true } }),
  games: item({ id: "games", name: "Games", href: "/games", description: "Play every market-powered game.", icon: Gamepad2 }),
  automate: item({ id: "automate", name: "Automate", href: "/strategies", description: "Strategies and agents that trade for you.", icon: Sparkles, keywords: "strategies agents copy bots", match: { paths: ["/strategies", "/agents"] } }),
  leaderboard: item({ id: "leaderboard", name: "Leaderboard", href: "/leaderboard", description: "The strongest verified records.", icon: Trophy, keywords: "rank ranking profile", match: { paths: ["/leaderboard", "/u"] } }),

  practice: item({ id: "practice", name: "Practice", href: "/games/practice", description: "Learn the swipe loop without stakes.", icon: Goal, match: { paths: ["/games/practice"], exact: true } }),
  duel: item({ id: "duel", name: "Duel", href: "/games/duel", description: "Face another player over a live deck.", icon: Handshake, match: { paths: ["/games/duel"] } }),
  lucky: item({ id: "lucky", name: "Lucky", href: "/games/lucky", description: "Let the reel find a live market call.", icon: Dices, match: { paths: ["/games/lucky"], exact: true } }),
  range: item({ id: "range", name: "Range", href: "/games/range", description: "Pick the band where price should finish.", icon: Layers3, match: { paths: ["/games/range"], exact: true } }),
  moonshot: item({ id: "moonshot", name: "Moonshot", href: "/games/moonshot", description: "Aim for a distant price target.", icon: Rocket, match: { paths: ["/games/moonshot"], exact: true } }),
  lineRider: item({ id: "line-rider", name: "Line Rider", href: "/games/line-rider", description: "Ride the line and build a combo.", icon: ChartNoAxesCombined, match: { paths: ["/games/line-rider"], exact: true } }),
  candleHop: item({ id: "candle-hop", name: "Candle Hop", href: "/games/candle-hop", description: "Hop through a candlestick run.", icon: Mountain, match: { paths: ["/games/candle-hop"], exact: true } }),

  parlay: item({ id: "parlay", name: "Parlay", href: "/parlay", description: "Combine several market outcomes.", icon: ChartNoAxesCombined }),
  earn: item({ id: "earn", name: "Earn", href: "/earn", description: "Supply the maker vault and the house reserves.", icon: Coins, keywords: "vault yield maker reserve supply" }),
  themes: item({ id: "themes", name: "Themes", href: "/themes", description: "Follow a basket an agent rebalances.", icon: Palette, keywords: "baskets follow stocks" }),
  launch: item({ id: "launch", name: "Launch", href: "/launch", description: "Launch a stablecoin or a memecoin.", icon: Rocket, keywords: "token create memecoin stablecoin" }),
  bridge: item({ id: "bridge", name: "Bridge", href: "/bridge", description: "Move stock tokens to and from Tempo.", icon: ArrowLeftRight, keywords: "robinhood layerzero transfer stocks" }),
  reserves: item({ id: "reserves", name: "Reserves", href: "/reserves", description: "Check every bridged token is backed.", icon: ShieldCheck, keywords: "proof backing stocks" }),
  surface: item({ id: "surface", name: "Market Surface", href: "/surface", description: "The market's shape at a glance.", icon: ScanSearch }),
  sensei: item({ id: "sensei", name: "Sensei", href: "/markets?sensei=1", description: "Ask the market assistant.", icon: MessageSquare, keywords: "assistant ai help", match: { paths: [] } }),
  xTrade: item({ id: "x-trade", name: "X-trade", href: "/trade-from-x", description: "Turn a post into a bounded trade.", icon: XLogo }),

  strategies: item({ id: "strategies", name: "Strategies", href: "/strategies", description: "Copy a strategy, or build one.", icon: Bot, beta: true }),
  agents: item({ id: "agents", name: "Agents", href: "/agents", description: "Copy automated market agents.", icon: Bot }),

  demo: item({ id: "demo", name: "Demo", href: "/demo", description: "The film, and what to check on chain.", icon: Clapperboard }),
  news: item({ id: "news", name: "News", href: "/news", description: "The stories moving markets.", icon: Newspaper }),
  howItWorks: item({ id: "how-it-works", name: "How it works", href: "/how-it-works", description: "The product from end to end.", icon: CircleHelp }),
  download: item({ id: "download", name: "Download", href: "/download", description: "Install Mitoshi as an app.", icon: Download, keywords: "install pwa app" }),
  reels: item({ id: "reels", name: "Reels", href: "/reels", description: "Scan market stories quickly.", icon: GalleryVerticalEnd }),
  docs: item({ id: "docs", name: "Docs", href: DOCS_URL, external: DOCS_EXTERNAL, description: "Step-by-step guides.", icon: BookOpen }),
  pitch: item({ id: "pitch", name: "Pitch", href: "/pitch", description: "The Mitoshi thesis.", icon: Presentation }),

  activity: item({ id: "activity", name: "Activity", href: "/activity", description: "Your fills, verdicts and payouts.", icon: Activity, keywords: "notifications feed social inbox" }),
  edge: item({ id: "edge", name: "Trader Edge", href: "/portfolio/edge", description: "Your trading edge report.", icon: ChartCandlestick }),
  stats: item({ id: "stats", name: "Stats", href: "/stats", description: "Protocol and market activity.", icon: BarChart3 }),
  gamesRank: item({ id: "games-rank", name: "Game ranks", href: "/games/rank", description: "Season standings for duels.", icon: Trophy, match: { paths: ["/games/rank"], exact: true } }),
  gamesHistory: item({ id: "games-history", name: "Games history", href: "/games/history", description: "Every duel and run you played.", icon: History, match: { paths: ["/games/history"], exact: true } }),
  status: item({ id: "status", name: "Status", href: "/status", description: "Every service Mitoshi runs on, live.", icon: Activity }),
  halts: item({ id: "halts", name: "Trading halts", href: "/status/halts", description: "Halts on the listed stocks.", icon: CirclePause, keywords: "halt luld paused stock" }),

  account: item({ id: "account", name: "Account & keys", href: "/settings/account", description: "Passkeys, keys and grants.", icon: Settings, keywords: "settings revoke passkey security" }),
  notifications: item({ id: "notifications", name: "Notifications", href: "/settings/notifications", description: "Choose what reaches you.", icon: Bell }),
  xRecovery: item({ id: "x-recovery", name: "X recovery", href: "/claim", description: "Recover a trade created from X.", icon: KeyRound }),
} as const satisfies Record<string, NavItem>;

/** The six places, in rail order; keys 1–6 jump to them (Owarine `PLACES`). */
export const RAIL_NAV: readonly NavItem[] = [NAV_ITEMS.trade, NAV_ITEMS.markets, NAV_ITEMS.portfolio, NAV_ITEMS.games, NAV_ITEMS.automate, NAV_ITEMS.leaderboard];

/** The phone dock: Trade and Markets, the seal, Portfolio, then More (Owarine `DOCK`). */
export const DOCK_NAV: readonly NavItem[] = [NAV_ITEMS.trade, NAV_ITEMS.markets, NAV_ITEMS.portfolio];

/** The places the dock has no room for; More's phone grid lists them. */
export const DOCK_OMITTED: readonly NavItem[] = RAIL_NAV.filter((p) => !DOCK_NAV.includes(p));

/** Everything that is not a place, grouped (Owarine `MORE`). The first section is what most people open More for. */
export const EVERYTHING_SECTIONS: readonly NavSection[] = [
  { id: "trade", name: "More ways to trade", items: [NAV_ITEMS.parlay, NAV_ITEMS.earn, NAV_ITEMS.themes, NAV_ITEMS.launch, NAV_ITEMS.bridge, NAV_ITEMS.reserves, NAV_ITEMS.surface, NAV_ITEMS.sensei, NAV_ITEMS.xTrade] },
  { id: "learn", name: "Learn", items: [NAV_ITEMS.demo, NAV_ITEMS.news, NAV_ITEMS.howItWorks, NAV_ITEMS.download, NAV_ITEMS.reels, NAV_ITEMS.docs, NAV_ITEMS.pitch] },
  { id: "games", name: "Games", items: [NAV_ITEMS.practice, NAV_ITEMS.duel, NAV_ITEMS.lucky, NAV_ITEMS.range, NAV_ITEMS.moonshot, NAV_ITEMS.lineRider, NAV_ITEMS.candleHop] },
  { id: "automate", name: "Automate", items: [NAV_ITEMS.agents] },
  { id: "records", name: "Records and proof", items: [NAV_ITEMS.activity, NAV_ITEMS.edge, NAV_ITEMS.stats, NAV_ITEMS.gamesRank, NAV_ITEMS.gamesHistory, NAV_ITEMS.status, NAV_ITEMS.halts] },
  { id: "account", name: "Account", items: [NAV_ITEMS.account, NAV_ITEMS.notifications, NAV_ITEMS.xRecovery] },
];
export const EVERYTHING_ITEMS: readonly NavItem[] = EVERYTHING_SECTIONS.flatMap((section) => section.items);

/** Every real, user-facing page; each must have a home in the places or More (the route-coverage contract). */
export const NAVIGABLE_ROUTE_PATHS = [
  "/activity", "/agents", "/bridge", "/claim", "/demo", "/docs", "/download", "/earn", "/games", "/games/candle-hop", "/games/duel",
  "/games/history", "/games/line-rider", "/games/lucky", "/games/moonshot", "/games/practice", "/games/range", "/games/rank",
  "/how-it-works", "/launch", "/leaderboard", "/markets", "/news", "/parlay", "/pitch", "/portfolio", "/portfolio/edge",
  "/reels", "/reserves", "/settings/account", "/settings/notifications", "/stats", "/status", "/status/halts", "/strategies",
  "/surface", "/themes", "/trade", "/trade-from-x",
] as const;

export function isActiveNavItem(pathname: string | null, item: NavItem): boolean {
  if (!pathname || item.external) return false;
  const fallbackPath = item.href.split("?")[0] ?? item.href;
  const match = item.match ?? { paths: [fallbackPath] };
  return match.paths.some((path) => pathname === path || (!match.exact && pathname.startsWith(`${path}/`)));
}

/**
 * Where the back chevron goes from a nested page whose parent path is no page (R4-0, D-227): `/tickers`, `/u`, `/proof`
 * and `/settings` have none, so dropping the last segment opened a 404. First match wins; anything else goes up a
 * segment (`/games/duel/abc` → `/games/duel`).
 */
export const PARENTS: readonly (readonly [prefix: string, href: string])[] = [
  ["/tickers/", "/markets"],
  ["/u/", "/leaderboard"],
  ["/proof/", "/status"],
  ["/settings/", "/portfolio"],
];

/** The page above a nested route: its registered parent, else the path one segment up. */
export function parentOf(pathname: string): string {
  const hit = PARENTS.find(([prefix]) => pathname.startsWith(prefix));
  if (hit) return hit[1];
  const parts = pathname.split("/").filter(Boolean);
  return parts.length <= 1 ? "/" : `/${parts.slice(0, -1).join("/")}`;
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
