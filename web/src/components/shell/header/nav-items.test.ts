// Ported from Masayume 68f7a09:web/src/components/shell/header/nav-items.test.ts, plus the route-coverage contract
// against the real app directory (Agari 03b30ab nav-items.test.ts): every navigable route has a page and a nav home,
// every page is reachable, and every pending page is registered.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PENDING } from "../../../lib/capabilities";
import { DOCS_URL } from "../../../lib/docs-url";
import { DESKTOP_NAV, isActiveNavItem, isTopLevel, MOBILE_DRAWER_SECTIONS, MOBILE_NAV, NAVIGABLE_ROUTE_PATHS, NAV_ITEMS, searchNav, type NavItem } from "./nav-items";

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
  it("keeps the desktop and phone fast paths compact, both pillars first-class", () => {
    expect(DESKTOP_NAV.map((e) => (e.kind === "link" ? e.item.name : e.group.name))).toEqual(["Markets", "Stocks", "Reels", "Games", "Build", "Explore", "Portfolio"]);
    expect(MOBILE_NAV.map((i) => i.name)).toEqual(["Markets", "Stocks", "Games", "Portfolio"]);
  });

  it("gives every More-panel destination exactly one home", () => {
    const ids = MOBILE_DRAWER_SECTIONS.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every navigable route a nav home", () => {
    const homes = [...MOBILE_NAV, ...MOBILE_DRAWER_SECTIONS.flatMap((s) => s.items)].map((i) => i.href.split("?")[0]);
    expect(NAVIGABLE_ROUTE_PATHS.filter((p) => !homes.includes(p))).toEqual([]);
  });

  it("maps nested routes to their top-level destinations and knows the top level", () => {
    expect(isActiveNavItem("/games/range", NAV_ITEMS.games)).toBe(true);
    expect(isActiveNavItem("/games/range", NAV_ITEMS.gamesHub)).toBe(false);
    expect(isActiveNavItem("/markets/0xabc", NAV_ITEMS.markets)).toBe(true);
    expect(isActiveNavItem("/portfolio/edge", NAV_ITEMS.portfolio)).toBe(false);
    expect(isTopLevel("/markets")).toBe(true);
    expect(isTopLevel("/games/duel")).toBe(false);
  });

  it("keeps docs external and every app destination internal", () => {
    const items: NavItem[] = Object.values(NAV_ITEMS);
    expect(items.filter((i) => i.external).map((i) => i.id)).toEqual(["docs"]);
    expect(NAV_ITEMS.docs.href).toBe(DOCS_URL);
    expect(items.filter((i) => !i.external).every((i) => i.href.startsWith("/"))).toBe(true);
  });

  it("searches the More panel by name, description and keywords", () => {
    expect(searchNav(MOBILE_DRAWER_SECTIONS.flatMap((s) => s.items), "revoke").map((i) => i.id)).toEqual(["account"]);
    expect(searchNav([NAV_ITEMS.bridge], "robinhood")).toHaveLength(1);
    expect(searchNav([NAV_ITEMS.bridge], "zzz")).toHaveLength(0);
  });
});

describe("route coverage (fidelity list 14)", () => {
  const routes = pageRoutes().filter((r) => !r.startsWith("/dev"));

  it("has a page for every navigable route", () => {
    expect(NAVIGABLE_ROUTE_PATHS.filter((p) => !routes.includes(p))).toEqual([]);
  });

  it("gives every static page a nav home, a parent that links to it, or an explicit off-nav reason", () => {
    const navigable = new Set<string>(NAVIGABLE_ROUTE_PATHS);
    const linkedFrom = new Set(Object.values(PENDING).flatMap((p) => (p.links ?? []).map((l) => l.href)));
    const orphans = routes.filter((r) => !r.includes("[") && !navigable.has(r) && !OFF_NAV.has(r) && !linkedFrom.has(r));
    expect(orphans).toEqual([]);
  });

  it("registers every pending capability against a real page, and nothing else", () => {
    const pending = Object.keys(PENDING);
    expect(pending.filter((p) => !routes.includes(p))).toEqual([]);
  });
});
