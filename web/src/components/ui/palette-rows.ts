// ⌘K's rows, pure (R6 shell S24; Raycast's one row per thing with ↵ / ⌘↵ actions, fal's suggestions for an empty
// query, Meta AI's Recent first). One row per asset — ↵ trades it, ⌘↵ opens its hub — instead of a Trade row and a
// Stocks row for the same name; an empty palette is Recent, Go to and Live now, and the pages appear once you type.
import type { LucideIcon } from "lucide-react";

export type PaletteRowKind = "place" | "asset" | "page";

export interface PaletteRow {
  /** Unique across groups; Recent stores it. */
  id: string;
  kind: PaletteRowKind;
  name: string;
  href: string;
  /** An asset's second action (⌘↵): its hub. */
  hub?: string;
  /** What the filter matches beside the name. */
  keywords: string;
  icon?: LucideIcon;
  /** A ticker's brand disc instead of an icon. */
  asset?: string;
  /** An asset with a Window open now. */
  live?: boolean;
  /** Right-hand text: a place's key, an asset's ticker, a page's line. */
  shortcut?: string;
  shortcutKind?: "key" | "data" | "desc";
  external?: boolean;
  soon?: boolean;
}

export interface PaletteGroup {
  heading: string;
  rows: readonly PaletteRow[];
}

export interface PaletteInput {
  query: string;
  places: readonly PaletteRow[];
  assets: readonly PaletteRow[];
  pages: readonly PaletteRow[];
  /** Ids of the last picks, newest first. */
  recent: readonly string[];
  headings: { recent: string; places: string; live: string; assets: string; pages: string };
}

export const RECENT_MAX = 5;
const matches = (row: PaletteRow, q: string) => `${row.name} ${row.keywords}`.toLowerCase().includes(q);

export function paletteGroups({ query, places, assets, pages, recent, headings }: PaletteInput): PaletteGroup[] {
  const q = query.trim().toLowerCase();
  const byId = new Map([...places, ...assets, ...pages].map((r) => [r.id, r]));
  const recentRows = recent.map((id) => byId.get(id)).filter((r): r is PaletteRow => r !== undefined).slice(0, RECENT_MAX);
  const groups: PaletteGroup[] = q
    ? [
        { heading: headings.places, rows: places.filter((r) => matches(r, q)) },
        { heading: headings.assets, rows: assets.filter((r) => matches(r, q)) },
        { heading: headings.pages, rows: pages.filter((r) => matches(r, q)) },
      ]
    : [
        // Recent leads.
        { heading: headings.recent, rows: recentRows.map((r) => ({ ...r, id: `recent:${r.id}` })) },
        { heading: headings.places, rows: places },
        { heading: headings.live, rows: assets.filter((r) => r.live) },
      ];
  return groups.filter((g) => g.rows.length > 0);
}

/** The id a row was stored under (Recent's copies carry a prefix). */
export const baseId = (id: string): string => id.replace(/^recent:/, "");

/** The next Recent list after a pick: newest first, no repeats, at most five. */
export function withPick(recent: readonly string[], id: string): string[] {
  const base = baseId(id);
  return [base, ...recent.filter((r) => r !== base)].slice(0, RECENT_MAX);
}
