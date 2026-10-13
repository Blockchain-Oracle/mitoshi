"use client";
// The docs' on-page contents on a desk (R4-10, D-227) — From 21st.dev 18123 inference-sh/table-of-contents, revamped:
// kept its intersection-observer active section, the left rail with the active row's ink edge, and the click that
// scrolls to the heading; changed: the items are read from the page's own H2s after each navigation (each gets a slug
// id if it has none), the root margin is a share of the viewport, the scroll honours reduced motion, and the colours
// are Mitoshi's tokens. Hidden under 1280 px (the layout's third column); a page with fewer than two headings shows none.
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { headingSlug as slug } from "./slug";

interface TocItem {
  id: string;
  title: string;
}

function useHeadings(): TocItem[] {
  const path = usePathname();
  const [items, setItems] = useState<TocItem[]>([]);
  useEffect(() => {
    const seen = new Set<string>();
    const found = [...document.querySelectorAll<HTMLHeadingElement>(".docs-prose h2")].map((h) => {
      let id = h.id || slug(h.textContent ?? "");
      while (seen.has(id)) id = `${id}-1`;
      seen.add(id);
      if (h.id !== id) h.id = id;
      return { id, title: h.textContent ?? "" };
    });
    setItems(found);
  }, [path]);
  return items;
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState("");
  useEffect(() => {
    if (ids.length === 0) return;
    const observer = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-10% 0% -80% 0%", threshold: 0 });
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

const TOC = { title: "On this page" } as const;

export function DocsToc() {
  const items = useHeadings();
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const active = useActiveSection(ids);
  if (items.length < 2) return null;
  const go = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  return (
    <nav aria-label={TOC.title} className="flex flex-col gap-3">
      <p className="type-label-micro text-ink-secondary">{TOC.title}</p>
      <ul className="flex flex-col border-l border-hairline">
        {items.map(({ id, title }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => go(id)}
              aria-current={active === id ? "location" : undefined}
              className={cn("-ml-px flex min-h-9 w-full items-center border-l py-1 pl-3 text-left type-caption transition-colors", active === id ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:border-ink-muted hover:text-ink")}
            >
              {title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
