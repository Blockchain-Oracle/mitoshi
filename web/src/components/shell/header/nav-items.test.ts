// Ported from Masayume 68f7a09:web/src/components/shell/header/nav-items.test.ts, plus the route-coverage contract
// against the real app directory (Agari 03b30ab nav-items.test.ts): every navigable route has a page and a nav home,
// every page is reachable, and every pending page is registered.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PENDING } from "../../../lib/capabilities";
import { DOCS_EXTERNAL, DOCS_URL } from "../../../lib/docs-url";
import { DOCS_NAV } from "../../../features/docs/nav";
import { DOCK_NAV, EVERYTHING_SECTIONS, isActiveNavItem, isTopLevel, NAVIGABLE_ROUTE_PATHS, NAV_ITEMS, parentOf, RAIL_NAV, searchNav, type NavItem } from "./nav-items";

const APP_DIR = fileURLToPath(new URL("../../../app", import.meta.url));

/** Every `page.tsx` as its URL: route groups dropped, dynamic segments kept as `[x]`. */
function pageRoutes(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...pageRoutes(abs));
    else if (entry === "page.tsx") {
      const segs = relative(APP_DIR, dir).split("/").filter((s) => s && !/^\(.*\)$/.test(s));
      out.push(`/${segs.join("/")}`.replace(/\/$/, "") || "/");
    }
  }
  return out.sort();
}

/** Pages that live outside the nav on purpose: the landing, legal/contact (footer), the app handoff, and dev fixtures. */
const OFF_NAV = new Set(["/", "/privacy", "/terms", "/contact", "/native-auth"]);

describe("navigation registry", () => {
  it("keeps Owarine's six places (D-226: no Stocks place) and phone dock: Trade · Markets · [seal] · Portfolio · More", () => {
    expect(RAIL_NAV.map((i) => i.name)).toEqual(["Trade", "Markets", "Portfolio", "Games", "Automate", "Leaderboard"]);
    expect(DOCK_NAV.map((i) => i.name)).toEqual(["Trade", "Markets", "Portfolio"]);
  });

  it("gives every More destination exactly one home, never a place again", () => {
    const ids = EVERYTHING_SECTIONS.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => RAIL_NAV.some((p) => p.id === id))).toEqual([]);
    expect(Object.values(NAV_ITEMS).some((i) => i.href.startsWith("/stocks"))).toBe(false);
  });

  it("gives every navigable route a nav home", () => {
    const homes = [...RAIL_NAV, ...EVERYTHING_SECTIONS.flatMap((s) => s.items)].map((i) => i.href.split("?")[0]);
    expect(NAVIGABLE_ROUTE_PATHS.filter((p) => !homes.includes(p))).toEqual([]);
  });

  it("maps nested routes to their top-level destinations and knows the top level", () => {
    expect(isActiveNavItem("/games/range", NAV_ITEMS.games)).toBe(true);
    expect(isActiveNavItem("/markets/0xabc", NAV_ITEMS.markets)).toBe(true);
    expect(isActiveNavItem("/tickers/TSLA", NAV_ITEMS.markets)).toBe(true);
    expect(isActiveNavItem("/agents/7", NAV_ITEMS.automate)).toBe(true);
    expect(isActiveNavItem("/u/0xabc", NAV_ITEMS.leaderboard)).toBe(true);
    expect(isActiveNavItem("/trade/BTC", NAV_ITEMS.trade)).toBe(true);
    expect(isActiveNavItem("/trade-from-x", NAV_ITEMS.trade)).toBe(false);
    expect(isActiveNavItem("/portfolio/edge", NAV_ITEMS.portfolio)).toBe(false);
    expect(isTopLevel("/markets")).toBe(true);
    expect(isTopLevel("/games/duel")).toBe(false);
  });

  it("keeps docs external only when they are another site, and every app destination internal", () => {
    const items: NavItem[] = Object.values(NAV_ITEMS);
    expect(items.filter((i) => i.external).map((i) => i.id)).toEqual(DOCS_EXTERNAL ? ["docs"] : []);
    expect(NAV_ITEMS.docs.href).toBe(DOCS_URL);
    expect(items.filter((i) => !i.external).every((i) => i.href.startsWith("/"))).toBe(true);
  });

  it("searches More by name, description and keywords", () => {
    expect(searchNav(EVERYTHING_SECTIONS.flatMap((s) => s.items), "revoke").map((i) => i.id)).toEqual(["account"]);
    expect(searchNav([NAV_ITEMS.bridge], "robinhood")).toHaveLength(1);
    expect(searchNav([NAV_ITEMS.bridge], "zzz")).toHaveLength(0);
  });
});

describe("route coverage (fidelity list 14)", () => {
  const routes = pageRoutes().filter((r) => !r.startsWith("/dev"));

  it("has a page for every navigable route", () => {
    expect(NAVIGABLE_ROUTE_PATHS.filter((p) => !routes.includes(p))).toEqual([]);
  });

  it("sends the back chevron to a real page from every nested route (R4-0: /tickers/*, /u/*, /proof/* 404'd)", () => {
    expect(parentOf("/tickers/TSLA")).toBe("/markets");
    expect(parentOf("/u/0xabc")).toBe("/leaderboard");
    expect(parentOf("/settings/account")).toBe("/portfolio");
    expect(parentOf("/games/duel/abc")).toBe("/games/duel");
    // Every nested page's parent is a page (dynamic segments stand in as `[x]`, `/dev` is a fixture).
    const pages = new Set(routes);
    const nested = routes.filter((r) => !r.startsWith("/dev") && r.split("/").filter(Boolean).length > 1);
    expect(nested.map((r) => [r, parentOf(r.replace(/\[[^\]]+\]/g, "x"))]).filter(([, p]) => !pages.has(p!))).toEqual([]);
  });

  it("gives every static page a nav home, a parent that links to it, or an explicit off-nav reason", () => {
    const navigable = new Set<string>(NAVIGABLE_ROUTE_PATHS);
    // Pending pages link their children; the docs' sidebar links every docs page (S20, L-20).
    const linkedFrom = new Set([...Object.values(PENDING).flatMap((p) => (p.links ?? []).map((l) => l.href)), ...DOCS_NAV.flatMap((s) => s.pages.map((p) => p.href))]);
    const orphans = routes.filter((r) => !r.includes("[") && !navigable.has(r) && !OFF_NAV.has(r) && !linkedFrom.has(r));
    expect(orphans).toEqual([]);
  });

  it("registers every pending capability against a real page, and nothing else", () => {
    const pending = Object.keys(PENDING);
    expect(pending.filter((p) => !routes.includes(p))).toEqual([]);
  });
});
