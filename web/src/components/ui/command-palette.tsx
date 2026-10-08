"use client";

// From 21st.dev 31354 wensity/command — revamped per D-044: Base UI Autocomplete (inline, mode none) inside a centred
// Base UI Dialog (overlay rule), fed by the one nav registry so every destination is one search away; Masayume tokens
// in `styles/command.css` instead of `--primitive-*` and literals; lucide instead of tabler; nested pages dropped (the
// registry is flat); options ≥ 44 px, input 16 px. Loaded on first open (lazy island, plan §3.1).
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EVERYTHING_SECTIONS, RAIL_NAV, searchNav, type NavItem } from "@/components/shell/header/nav-items";
import { SHELL } from "@/lib/copy";
import { openExternal } from "@/lib/open-external";
import "@/styles/command.css";

const GROUPS: { heading: string; items: readonly NavItem[] }[] = [
  { heading: "Go to", items: RAIL_NAV },
  ...EVERYTHING_SECTIONS.map((s) => ({ heading: s.name, items: s.items })),
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: searchNav(g.items, query) })).filter((g) => g.items.length > 0),
    [query],
  );
  const go = (item: NavItem) => {
    onOpenChange(false);
    setQuery("");
    if (item.external) openExternal(item.href);
    else router.push(item.href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="command-backdrop" />
        <Dialog.Viewport className="command-viewport">
          <Dialog.Popup className="command-popup">
            <Dialog.Title className="sr-only">{SHELL.commandHint}</Dialog.Title>
            <Autocomplete.Root inline open mode="none" value={query} onValueChange={setQuery} autoHighlight="always" keepHighlight>
              <div className="command-input-row">
                <Search aria-hidden className="command-input-icon" />
                <Autocomplete.Input aria-label={SHELL.searchLabel} placeholder={SHELL.searchPlaceholder} autoComplete="off" spellCheck={false} className="command-input" autoFocus />
              </div>
              <Autocomplete.List className="command-list">
                {groups.length === 0 ? (
                  <div role="status" className="command-empty">{SHELL.searchEmpty(query)}</div>
                ) : (
                  groups.map((group) => (
                    <Autocomplete.Group key={group.heading} className="command-group">
                      <Autocomplete.GroupLabel className="command-group-label">{group.heading}</Autocomplete.GroupLabel>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Autocomplete.Item key={`${group.heading}-${item.id}`} value={item.id} onClick={() => go(item)} className="command-item">
                            <Icon aria-hidden className="command-item-icon" />
                            <span className="command-item-copy">
                              <span className="command-item-label">{item.name}</span>
                              <span className="command-item-desc">{item.description}</span>
                            </span>
                          </Autocomplete.Item>
                        );
                      })}
                    </Autocomplete.Group>
                  ))
                )}
              </Autocomplete.List>
              <div className="command-hints" aria-hidden>
                <kbd><CornerDownLeft className="size-3" /></kbd> Open <kbd>↑</kbd><kbd>↓</kbd> Move <kbd>esc</kbd> Close
              </div>
            </Autocomplete.Root>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default CommandPalette;
