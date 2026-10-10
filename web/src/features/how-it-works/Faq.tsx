"use client";
// Ported from Masayume 68f7a09:web/src/features/how-it-works/Faq.tsx unchanged.

import { ChevronDownIcon, HelpCircleIcon } from "lucide-react";
import { useId, useState } from "react";
import { FAQS } from "./content";
import { HOW_IT_WORKS } from "./copy";
import { riseDelay } from "./rise";

/** The reference's stagger for FAQ rows: `0.5 + index * 0.05`. */
const FAQ_BASE_MS = 500;
const FAQ_STEP_MS = 50;

/**
 * The accordion (reference L377–417): one row open at a time, the chevron turning.
 *
 * The reference animates height with framer-motion's `AnimatePresence`; here the answer
 * sits in a grid row that goes 0fr → 1fr, which is the same motion without the library,
 * and the row stays in the DOM so a screen reader can reach it through `aria-controls`.
 */
export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();
  return (
    <section className="hiw-section" aria-label={HOW_IT_WORKS.sections.faq}>
      <h2 className="hiw-label">
        <HelpCircleIcon aria-hidden />
        {HOW_IT_WORKS.sections.faq}
      </h2>
      <div className="hiw-faq">
        {FAQS.map((faq, index) => {
          const isOpen = open === index;
          const panelId = `${baseId}-${index}`;
          const buttonId = `${panelId}-q`;
          return (
            <div
              key={faq.question}
              className="hiw-faq-item hiw-rise"
              data-open={isOpen}
              style={riseDelay(0, FAQ_BASE_MS + index * FAQ_STEP_MS)}
            >
              <button
                id={buttonId}
                type="button"
                className="hiw-faq-q"
                onClick={() => setOpen(isOpen ? null : index)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                data-cursor="hover"
              >
                <span>{faq.question}</span>
                <ChevronDownIcon className="hiw-faq-chevron" aria-hidden />
              </button>
              <div id={panelId} className="hiw-faq-a" role="region" aria-labelledby={buttonId} aria-hidden={!isOpen}>
                <div>
                  <p className="hiw-body-dim">{faq.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
