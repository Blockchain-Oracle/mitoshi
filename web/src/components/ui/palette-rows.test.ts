import { describe, expect, it } from "vitest";
import { paletteGroups, withPick, type PaletteRow } from "./palette-rows";

const headings = { recent: "Recent", places: "Go to", live: "Live now", assets: "Assets", pages: "Pages" };
const place = (id: string, name: string): PaletteRow => ({ id: `place-${id}`, kind: "place", name, href: `/${id}`, keywords: "" });
const asset = (s: string, name: string, live: boolean): PaletteRow => ({ id: `asset-${s}`, kind: "asset", name, href: `/trade/${s}`, hub: `/tickers/${s}`, keywords: s, asset: s, live });
const page = (id: string, name: string): PaletteRow => ({ id: `page-${id}`, kind: "page", name, href: `/${id}`, keywords: "" });

const places = [place("markets", "Markets"), place("portfolio", "Portfolio")];
const assets = [asset("BTC", "Bitcoin", true), asset("AAPL", "Apple", false), asset("TSLA", "Tesla", true)];
const pages = [page("earn", "Earn"), page("status", "Status")];

describe("⌘K rows", () => {
  it("opens on Recent, Go to and Live now, with no page list and one row per asset", () => {
    const groups = paletteGroups({ query: "", places, assets, pages, recent: ["page-earn", "asset-AAPL"], headings });
    expect(groups.map((g) => g.heading)).toEqual(["Recent", "Go to", "Live now"]);
    expect(groups[0]!.rows.map((r) => r.name)).toEqual(["Earn", "Apple"]);
    expect(groups[2]!.rows.map((r) => r.name)).toEqual(["Bitcoin", "Tesla"]);
  });
  it("searches every listed asset, live or not, and the pages once you type", () => {
    const groups = paletteGroups({ query: "a", places, assets, pages, recent: [], headings });
    expect(groups.map((g) => g.heading)).toEqual(["Go to", "Assets", "Pages"]);
    expect(groups[1]!.rows.map((r) => r.name)).toEqual(["Apple", "Tesla"]);
  });
  it("keeps Recent newest first, without repeats, five at most", () => {
    expect(withPick(["a", "b", "c", "d", "e"], "recent:c")).toEqual(["c", "a", "b", "d", "e"]);
    expect(withPick(["a", "b", "c", "d", "e"], "f")).toEqual(["f", "a", "b", "c", "d"]);
  });
});
