"use client";

// From 21st.dev 31354 wensity/command (D-044), rebuilt to Owarine's anatomy (R4-8, D-227): Ported from Owarine
// 90a91d71:web/src/components/shell/app/CommandPalette.tsx + components/ui/command.tsx — a centred card a third of the
// way down, a recessed pill field, ONE-line rounded rows that fill recessed when picked. Kept on Base UI Autocomplete
// (inline, mode none) inside a Base UI Dialog — no cmdk. R6 shell S24 (21st 2075 rafa-porto/command-palette's recents
// and per-row actions, Raycast's action model): one row per asset (↵ trades it, ⌘↵ / the phone's Hub chip opens its
// hub), an empty palette of Recent · Go to · Live now, the pages once you type (`palette-rows.ts`), and a hint bar
// naming the highlighted row's keys from 640 px. Recent is this viewer's last five picks (localStorage).
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { CRYPTO_SYMBOLS, isOk, isTickerSymbol, STOCK_SYMBOLS, TICKERS, type TickerSymbol } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EVERYTHING_SECTIONS, RAIL_NAV } from "@/components/shell/header/nav-items";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { isPendingHref } from "@/lib/capabilities";
import { SHELL } from "@/lib/copy";
import { openExternal } from "@/lib/open-external";
import { paletteGroups, withPick, type PaletteRow } from "./palette-rows";
import "@/styles/command.css";

/** The groups and the hint bar's words (R6 shell S24), here rather than in the shared copy: the palette loads on demand. */
const GROUPS = { recent: "Recent", places: "Go to", live: "Live now", assets: "Assets", pages: "Pages" } as const;
const HINTS = { trade: "Trade", hub: "Hub", open: "Open", close: "Close" } as const;

const RECENT_KEY = "cwf.palette.recent.v1";
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const saveRecent = (ids: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // no storage: Recent stays empty
  }
};

const PLACES: readonly PaletteRow[] = RAIL_NAV.map((item, i) => ({ id: `place-${item.id}`, kind: "place", name: item.name, href: item.href, keywords: `${item.description} ${item.keywords ?? ""}`, icon: item.icon, shortcut: String(i + 1), shortcutKind: "key" }));

const PAGES: readonly PaletteRow[] = EVERYTHING_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ id: `page-${item.id}`, kind: "page" as const, name: item.name, href: item.href, keywords: `${item.description} ${item.keywords ?? ""}`, icon: item.icon, shortcut: item.description, shortcutKind: "desc" as const, external: item.external, soon: isPendingHref(item.href) })),
);

const REGISTRY_ORDER: readonly TickerSymbol[] = [...CRYPTO_SYMBOLS, ...STOCK_SYMBOLS];

/** Every listed asset, one row each, live when a Window is open on the board (the lanes key: a shared cache hit). */
function useAssets(open: boolean): PaletteRow[] {
  const reading = useLanes(open);
  return useMemo(() => {
    const live = new Set<string>();
    if (reading && isOk(reading)) {
      const nowSec = Math.floor(Date.now() / 1000);
      for (const lane of reading.value.lanes) {
        for (const m of lane.markets) {
          const symbol = m.asset.trim().replace(/-24$/, "").toUpperCase();
          if (m.state === "open" && m.expirySec > nowSec && isTickerSymbol(symbol)) live.add(symbol);
        }
      }
    }
    return REGISTRY_ORDER.map((s) => ({ id: `asset-${s}`, kind: "asset" as const, name: TICKERS[s].name, href: `/trade/${s}`, hub: `/tickers/${s}`, keywords: `${s} trade stock coin`, asset: s, live: live.has(s), shortcut: s, shortcutKind: "data" as const }));
  }, [reading]);
}

/** A keycap, as the top line's search pill draws them. */
const Key = ({ k }: { k: string }) => <kbd className="command-kbd">{k}</kbd>;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Every way out clears the query — Esc, the backdrop, ⌘K again (R4-0, D-227: only a pick did, so the next open showed
  // the old filter). Reset while rendering the close, React's pattern for state that follows a prop.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setQuery("");
  }
  const assets = useAssets(open);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => void (open && setRecent(readRecent())), [open]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const groups = useMemo(
    () => paletteGroups({ query, places: PLACES, assets, pages: PAGES, recent, headings: GROUPS }),
    [query, assets, recent],
  );
  const rowById = useMemo(() => new Map(groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const))), [groups]);
  // autoHighlight="always" picks the first row without reporting it; a stale id (the query changed) means the same.
  const current = (highlighted ? rowById.get(highlighted) : undefined) ?? groups[0]?.rows[0] ?? null;
  const go = (row: PaletteRow, to: "main" | "hub" = "main") => {
    onOpenChange(false);
    setQuery("");
    const next = withPick(readRecent(), row.id);
    saveRecent(next);
    if (row.external) openExternal(row.href);
    else router.push(to === "hub" && row.hub ? row.hub : row.href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="command-backdrop" />
        <Dialog.Popup className="command-popup">
          <Dialog.Title className="sr-only">{SHELL.commandTitle}</Dialog.Title>
          <Dialog.Description className="sr-only">{SHELL.commandDesc}</Dialog.Description>
          <Autocomplete.Root inline open mode="none" value={query} onValueChange={setQuery} autoHighlight="always" keepHighlight onItemHighlighted={(v) => setHighlighted(typeof v === "string" ? v : null)}>
            <div className="command-field">
              <Search aria-hidden className="command-field-icon" strokeWidth={2.5} />
              <Autocomplete.Input
                aria-label={SHELL.searchLabel}
                placeholder={SHELL.commandPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="command-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && current?.hub) {
                    e.preventDefault();
                    go(current, "hub");
                  }
                }}
              />
            </div>
            <Autocomplete.List className="command-list">
              {groups.length === 0 ? (
                <div role="status" className="command-empty">{SHELL.searchEmpty}</div>
              ) : (
                groups.map((group) => (
                  <Autocomplete.Group key={group.heading} className="command-group">
                    <Autocomplete.GroupLabel className="command-group-label">{group.heading}</Autocomplete.GroupLabel>
                    {group.rows.map((row) => (
                      <Autocomplete.Item key={row.id} value={row.id} onClick={() => go(row)} className="command-item">
                        {row.asset ? <AssetDisc asset={row.asset} className="command-disc" /> : row.icon ? <row.icon aria-hidden className="command-icon" /> : null}
                        <span className="command-name">{row.name}</span>
                        {row.live ? <span aria-hidden className="command-live" /> : null}
                        {row.soon ? <span className="nav-soon">{SHELL.soon}</span> : null}
                        {row.shortcut ? <span className="command-shortcut" data-kind={row.shortcutKind}>{row.shortcut}</span> : null}
                        {row.hub && row.id === current?.id ? (
                          <button type="button" className="command-hub" onClick={(e) => (e.stopPropagation(), go(row, "hub"))}>{HINTS.hub}</button>
                        ) : null}
                      </Autocomplete.Item>
                    ))}
                  </Autocomplete.Group>
                ))
              )}
            </Autocomplete.List>
            <div className="command-hints" aria-hidden>
              {current?.hub ? (
                <>
                  <span><Key k="↵" /> {HINTS.trade}</span>
                  <span><Key k="⌘↵" /> {HINTS.hub}</span>
                </>
              ) : (
                <span><Key k="↵" /> {HINTS.open}</span>
              )}
              <span><Key k="esc" /> {HINTS.close}</span>
            </div>
          </Autocomplete.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default CommandPalette;
