// Ported from Owarine 90a91d71:web/src/components/shell/app/CommandPalette.tsx (`OPEN_SEARCH_EVENT`): anything on a page
// can open the ⌘K palette by firing this; the top line listens (R4-0, D-227 — the 404's Search pill).
export const OPEN_SEARCH_EVENT = "mitoshi:open-search";

export function openSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}
