"use client";
// Ported from Owarine 90a91d71:web/src/features/legal/LegalScreen.tsx's accordion (R4-13a, D-227): one card per section —
// its glyph, title and one-line gist — opening to its points. Panels are `hidden="until-found"`, so the browser's find
// still reaches every line. On Mitoshi's tokens (`styles/legal.css`).
import { Accordion } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  gist: string;
  icon: ReactNode;
  points: readonly ReactNode[];
  /** A closing line under the points (a note, a link). */
  foot?: ReactNode;
}

export function LegalAccordion({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <Accordion.Root multiple defaultValue={sections.length > 0 ? [sections[0]!.id] : []} className="legal-list">
      {sections.map((section) => (
        <Accordion.Item key={section.id} value={section.id} id={section.id} className="legal-item">
          <Accordion.Header>
            <Accordion.Trigger className="legal-trigger group">
              <span className="legal-glyph" aria-hidden>{section.icon}</span>
              <span className="legal-titles">
                <span className="legal-title">{section.title}</span>
                <span className="legal-gist">{section.gist}</span>
              </span>
              <ChevronDown aria-hidden className="legal-chevron" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel hiddenUntilFound className="legal-panel">
            <div className="legal-body">
              <ul className="legal-points">
                {section.points.map((point, i) => (
                  <li key={i} className="legal-point">{point}</li>
                ))}
              </ul>
              {section.foot ? <p className="legal-foot">{section.foot}</p> : null}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
