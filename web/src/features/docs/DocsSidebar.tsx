"use client";
// From 21st 19371 · uiable/sidebar-1 (S20 row: the docs sidebar, a right-edge panel on phones). Revamped: the dummy
// component list became the docs' sections and pages (`nav.ts`), its buttons real links with the current page from
// the route, and its card, input and scroll area Mitoshi's tokens and plain elements. Kept: the filter box over the
// list, grouped sections with sticky headings, the active row's tint.
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DOCS_NAV } from "./nav";

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const sections = DOCS_NAV.map((s) => ({ ...s, pages: s.pages.filter((p) => !q || p.title.toLowerCase().includes(q)) })).filter((s) => s.pages.length > 0);
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search the docs</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the docs"
          className="min-h-touch w-full rounded-md border border-hairline bg-surface-1 pl-9 pr-3 type-body text-ink placeholder:text-ink-muted"
        />
      </label>
      {sections.length === 0 ? <p className="px-3 type-caption text-ink-secondary">No page matches.</p> : null}
      {sections.map((s) => (
        <div key={s.title} className="flex flex-col gap-1">
          <p className="sticky top-0 z-10 bg-stage px-3 py-2 type-label-micro text-ink-secondary">{s.title}</p>
          {s.pages.map((p) => {
            const active = path === p.href;
            return (
              <Link
                key={p.href}
                href={p.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-touch items-center rounded-md px-3 type-body ${active ? "bg-surface-2 text-ink" : "text-ink-secondary hover:bg-surface-1 hover:text-ink"}`}
              >
                {p.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
