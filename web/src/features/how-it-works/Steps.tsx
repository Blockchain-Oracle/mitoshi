// Ported from Masayume 68f7a09:web/src/features/how-it-works/Steps.tsx — the example pays in dollars.
import { ArrowRightIcon } from "lucide-react";
import { STEPS } from "./content";
import { HOW_IT_WORKS } from "./copy";
import { riseDelay } from "./rise";

/** The four "Getting Started" tiles (reference L136–163) and the payout example (L165–199). */
export function Steps() {
  return (
    <>
      <section className="hiw-section" aria-label={HOW_IT_WORKS.sections.steps}>
        <h2 className="hiw-label">{HOW_IT_WORKS.sections.steps}</h2>
        <div className="hiw-grid">
          {STEPS.map((step, index) => (
            <article key={step.number} className="hiw-card hiw-rise" style={riseDelay(index)}>
              <div className="hiw-step">
                <span className="hiw-num" data-tone={step.tone} aria-hidden>
                  {step.number}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="hiw-card-title" data-tone={step.tone}>
                    <step.icon aria-hidden />
                    {step.title}
                  </h3>
                  <p className="hiw-body">{step.description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* The reference shows 64% / 36% / $1.00 with no label. Doc 05 §No fake-data: an
          editorial example is labelled as one, so the card says it is a worked example
          and not a live quote — the live odds are on the Ticket. */}
      <section className="hiw-section hiw-card hiw-card-wide hiw-card-mint hiw-rise" style={riseDelay(4)} aria-label={HOW_IT_WORKS.sections.example}>
        <h2 className="hiw-label">{HOW_IT_WORKS.sections.example}</h2>
        <p className="hiw-example-tag">{HOW_IT_WORKS.exampleTag}</p>
        <div className="hiw-example-grid">
          <div>
            <div className="hiw-figure" data-tone="mint">64¢</div>
            <div className="hiw-figure-label">{HOW_IT_WORKS.example.up}</div>
          </div>
          <div>
            <div className="hiw-figure" data-tone="red">36¢</div>
            <div className="hiw-figure-label">{HOW_IT_WORKS.example.down}</div>
          </div>
          <div>
            <div className="hiw-figure">$1.00</div>
            <div className="hiw-figure-label">{HOW_IT_WORKS.example.max}</div>
          </div>
        </div>
        <div className="hiw-example-row">
          <span>{HOW_IT_WORKS.example.buy}</span>
          <span className="hiw-chip">{HOW_IT_WORKS.example.contracts}</span>
          <ArrowRightIcon aria-hidden />
          <span>{HOW_IT_WORKS.example.outcome}</span>
          <ArrowRightIcon aria-hidden />
          <span>{HOW_IT_WORKS.example.get}</span>
          <span className="hiw-chip">{HOW_IT_WORKS.example.payout}</span>
          <span className="hiw-example-note">{HOW_IT_WORKS.example.profit}</span>
        </div>
      </section>
    </>
  );
}
