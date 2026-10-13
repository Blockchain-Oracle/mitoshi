// Ported from Owarine 90a91d71:web/src/features/legal/LegalScreen.tsx (R4-13a, D-227) — /privacy and /terms in /legal's
// frame: the title, a BETA sticker and three facts first (sticky beside the list from `lg`), then one card per
// section with a one-line gist, opening to its points. Inside the app shell, so it adds no inset of its own.
import { AtSign } from "lucide-react";
import Link from "next/link";
import { Children } from "react";
import { Sticker } from "@/components/kit/Sticker";
import "@/components/kit/kit.css";
import "@/styles/legal.css";
import { LEGAL } from "./copy";
import { LegalAccordion, type LegalSection } from "./LegalAccordion";

export function LegalScreen({ heading, lede, facts, sections }: { heading: string; lede: string; facts: readonly string[]; sections: readonly LegalSection[] }) {
  return (
    <div className="legal">
      <header className="legal-head">
        <div className="flex items-start gap-3">
          <h1 className="legal-h1">{heading}</h1>
          <Sticker tone="profit" tilt={-6} size="sm" className="mt-1">{LEGAL.sticker}</Sticker>
        </div>
        <p className="legal-lede">{lede}</p>
        <ul className="legal-facts">
          {facts.map((fact) => (
            <li key={fact} className="legal-fact">{fact}</li>
          ))}
        </ul>
        <Link href="/contact" className="legal-contact">
          <AtSign aria-hidden />
          {LEGAL.contact.label} <span>{LEGAL.contact.text}</span>
        </Link>
      </header>
      {/* Keyed here (R4-13): an array of elements crossing into the client accordion needs keys, or React warns once per
          point on every load. */}
      <LegalAccordion sections={sections.map((s) => ({ ...s, points: Children.toArray(s.points) }))} />
    </div>
  );
}
