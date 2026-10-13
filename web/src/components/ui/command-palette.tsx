"use client";

// From 21st.dev 31354 wensity/command (D-044), rebuilt to Owarine's anatomy (R4-8, D-227): Ported from Owarine
// 90a91d71:web/src/components/shell/app/CommandPalette.tsx + components/ui/command.tsx — a centred card a third of the
// way down, a recessed pill field, ONE-line rounded rows that fill recessed when picked, a right-hand shortcut, no
// footer. Kept on Base UI Autocomplete (inline, mode none; its highlight loops as cmdk's `loop` does) inside a Base UI
// Dialog — no cmdk. Groups: Go to (the six places, their key) → Trade (live: every asset with an open Window on the
// board, read only while open) → Stocks (once you type) → each More section (its line on the right, hidden < 640 px).
// No Events group: Mitoshi lists no event markets. Loaded on first open, preloaded on idle (TopLine).
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { CRYPTO_SYMBOLS, isOk, isTickerSymbol, STOCK_SYMBOLS, TICKERS, type TickerSymbol } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { Search, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EVERYTHING_SECTIONS, RAIL_NAV } from "@/components/shell/header/nav-items";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { isPendingHref } from "@/lib/capabilities";
import { SHELL } from "@/lib/copy";
import { openExternal } from "@/lib/open-external";
import "@/styles/command.css";

interface Row {
  id: string;
  name: string;
  href: string;
  /** What the filter matches beside the name. */
  keywords: string;
  icon?: LucideIcon;
  /** A ticker's brand disc instead of an icon. */
  asset?: string;
  shortcut?: string;
  /** "data": the ticker in the figures face; "desc": a page's line, hidden on phones. */
  shortcutKind?: "key" | "data" | "desc";
  external?: boolean;
  soon?: boolean;
}

interface Group {
  heading: string;
  rows: readonly Row[];
}

const PLACES: Group = {
  heading: SHELL.commandGroups.places,
  rows: RAIL_NAV.map((item, i) => ({ id: item.id, name: item.name, href: item.href, keywords: `${item.description} ${item.keywords ?? ""}`, icon: item.icon, shortcut: String(i + 1), shortcutKind: "key" })),
};

const SECTIONS: readonly Group[] = EVERYTHING_SECTIONS.map((section) => ({
  heading: section.name,
  rows: section.items.map((item) => ({
    id: `${section.id}-${item.id}`,
    name: item.name,
    href: item.href,
    keywords: `${item.description} ${item.keywords ?? ""}`,
    icon: item.icon,
    shortcut: item.description,
    shortcutKind: "desc",
    external: item.external,
    soon: isPendingHref(item.href),
  })),
}));

/** Each stock's hub, shown once the person types (the empty palette stays the map of places and live markets). */
const STOCKS: Group = {
  heading: SHELL.commandGroups.stocks,
  rows: STOCK_SYMBOLS.map((s) => ({ id: `ticker-${s}`, name: TICKERS[s].name, href: `/tickers/${s}`, keywords: `${s} stock`, asset: s, shortcut: `$${s}`, shortcutKind: "data" })),
};

const REGISTRY_ORDER: readonly TickerSymbol[] = [...CRYPTO_SYMBOLS, ...STOCK_SYMBOLS];

/** The assets ⌘K offers to trade: every listed ticker with a Window still open on the board, in registry order. Read
 *  only while the palette is open; the board shares the lanes key, so this is almost always a cache hit. */
function useLiveTrade(open: boolean): Group | null {
  const reading = useLanes(open);
  return useMemo(() => {
    if (!reading || !isOk(reading)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const live = new Set<string>();
    for (const lane of reading.value.lanes) {
      for (const m of lane.markets) {
        const symbol = m.asset.trim().replace(/-24$/, "").toUpperCase();
        if (m.state === "open" && m.expirySec > nowSec && isTickerSymbol(symbol)) live.add(symbol);
      }
    }
    const rows = REGISTRY_ORDER.filter((s) => live.has(s)).map((s) => ({ id: `trade-${s}`, name: TICKERS[s].name, href: `/trade/${s}`, keywords: `${s} trade`, asset: s, shortcut: s, shortcutKind: "data" as const }));
    return rows.length > 0 ? { heading: SHELL.commandGroups.trade, rows } : null;
  }, [reading]);
}

const matches = (row: Row, q: string) => `${row.name} ${row.keywords}`.toLowerCase().includes(q);

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
  const trade = useLiveTrade(open);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [PLACES, ...(trade ? [trade] : []), ...(q ? [STOCKS] : []), ...SECTIONS];
    return q ? all.map((g) => ({ ...g, rows: g.rows.filter((r) => matches(r, q)) })).filter((g) => g.rows.length > 0) : all;
  }, [query, trade]);
  const go = (row: Row) => {
    onOpenChange(false);
    setQuery("");
    if (row.external) openExternal(row.href);
    else router.push(row.href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="command-backdrop" />
        <Dialog.Popup className="command-popup">
          <Dialog.Title className="sr-only">{SHELL.commandTitle}</Dialog.Title>
          <Dialog.Description className="sr-only">{SHELL.commandDesc}</Dialog.Description>
          <Autocomplete.Root inline open mode="none" value={query} onValueChange={setQuery} autoHighlight="always" keepHighlight>
            <div className="command-field">
              <Search aria-hidden className="command-field-icon" strokeWidth={2.5} />
              <Autocomplete.Input aria-label={SHELL.searchLabel} placeholder={SHELL.commandPlaceholder} autoComplete="off" spellCheck={false} className="command-input" autoFocus />
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
                        {row.soon ? <span className="nav-soon">{SHELL.soon}</span> : null}
                        {row.shortcut ? <span className="command-shortcut" data-kind={row.shortcutKind}>{row.shortcut}</span> : null}
                      </Autocomplete.Item>
                    ))}
                  </Autocomplete.Group>
                ))
              )}
            </Autocomplete.List>
          </Autocomplete.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default CommandPalette;
