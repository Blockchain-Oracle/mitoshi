"use client";
// `/docs` — Ported from Owarine 90a91d71:web/src/features/legal/LegalScreen.tsx (R4-10, D-227): a sticky header beside
// one dropdown per docs section. The header: "Docs" with the TESTNET sticker, one line, three fact chips and the full
// docs site; each card: glyph, title, its gist, opening to its pages with a one-line gist each. Panels are
// `hidden="until-found"`, so the browser's find still reaches every line.
import { Accordion } from "@base-ui/react/accordion";
import { BookOpen, ChevronDown, Coins, FileText, Rocket, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Sticker } from "@/components/kit";
import { DOCS_NAV, DOCS_SITE } from "./nav";

const ICON: Record<string, LucideIcon> = { "Get started": Rocket, Trade: BookOpen, Settle: Coins, Reference: FileText };
const HOME = {
  heading: "Docs",
  sticker: "TESTNET",
  lede: "Mitoshi on Tempo testnet. Test dollars only.",
  facts: ["Passkey sign-in", "pathUSD", "Signed RedStone prints"],
  site: "Full docs ↗",
} as const;

export function DocsHome() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <header className="flex flex-col gap-5 lg:sticky lg:top-(--stage-sticky-top) lg:self-start">
        <div className="flex items-start gap-3">
          <h1 className="type-display text-ink">{HOME.heading}</h1>
          <Sticker tone="accent" tilt={-6} size="sm" className="mt-1">{HOME.sticker}</Sticker>
        </div>
        <p className="max-w-sm type-body text-ink-secondary">{HOME.lede}</p>
        <ul className="flex flex-wrap gap-2">
          {HOME.facts.map((fact) => (
            <li key={fact} className="inline-flex h-8 items-center rounded-full bg-surface-1 px-3.5 type-caption font-bold text-ink ring-1 ring-hairline">{fact}</li>
          ))}
        </ul>
        <a href={DOCS_SITE} target="_blank" rel="noopener noreferrer" className="w-fit type-caption font-bold text-accent underline-offset-4 hover:underline">{HOME.site}</a>
      </header>

      <Accordion.Root multiple defaultValue={[DOCS_NAV[0]!.title]} className="flex flex-col gap-3">
        {DOCS_NAV.map((section) => {
          const Glyph = ICON[section.title] ?? FileText;
          return (
            <Accordion.Item key={section.title} value={section.title} className="rounded-xl bg-surface-1 ring-1 ring-hairline">
              <Accordion.Header>
                <Accordion.Trigger className="group flex min-h-touch w-full items-center gap-3 px-4 py-3.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-accent">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2">
                    <Glyph aria-hidden className="size-4.5 text-ink" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate type-body-strong text-ink">{section.title}</span>
                    <span className="truncate type-caption text-ink-secondary">{section.gist}</span>
                  </span>
                  <ChevronDown aria-hidden className="size-4.5 shrink-0 text-ink-secondary transition-transform duration-200 group-data-panel-open:rotate-180 motion-reduce:transition-none" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel hiddenUntilFound className="status-panel">
                <ul className="mx-4 flex flex-col border-t border-hairline py-2">
                  {section.pages.map((page) => (
                    <li key={page.href}>
                      <Link href={page.href} className="flex min-h-touch items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                        <span className="flex min-w-0 flex-col">
                          <span className="type-body-strong text-ink">{page.title}</span>
                          <span className="type-caption text-ink-secondary">{page.gist}</span>
                        </span>
                        <span aria-hidden className="text-ink-muted">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion.Root>
    </div>
  );
}
