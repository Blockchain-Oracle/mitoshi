// Ported from Masayume 68f7a09:web/src/features/how-it-works/Mechanics.tsx — the pricing prose moved to `copy.ts`.
import { FEES, MECHANICS, QUOTE_FIELDS } from "./content";
import { HOW_IT_WORKS } from "./copy";
import { riseDelay } from "./rise";

/** The lead-in framer delay of the reference's mechanics cards (`0.4 + index * 0.08`). */
const MECHANICS_BASE_MS = 400;

/**
 * "Key Mechanics" (reference L201–223), the pricing model card (L225–254) and the fee
 * structure (L256–287).
 *
 * The reference's pricing section is the SVI variance surface its vault quotes from. This
 * venue is an order book, so the section keeps its shape — a paragraph, a formula box, a
 * parameter grid, a closing note — and shows the real thing: the price of UP is the best
 * ask on the book, and the fields below are the ones a quote actually carries.
 */
export function Mechanics() {
  return (
    <>
      <section className="hiw-section" aria-label={HOW_IT_WORKS.sections.mechanics}>
        <h2 className="hiw-label">{HOW_IT_WORKS.sections.mechanics}</h2>
        <div className="hiw-grid">
          {MECHANICS.map((item, index) => (
            <article key={item.title} className="hiw-card hiw-rise" style={riseDelay(index, MECHANICS_BASE_MS)}>
              <div className="hiw-card-head">
                <span className="hiw-icon" aria-hidden>
                  <item.icon />
                </span>
                <h3 className="hiw-card-title" style={{ marginBottom: 0 }}>
                  {item.title}
                </h3>
              </div>
              <p className="hiw-body">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="hiw-section" aria-label={HOW_IT_WORKS.sections.pricing}>
        <h2 className="hiw-label">{HOW_IT_WORKS.sections.pricing}</h2>
        <div className="hiw-card hiw-card-wide hiw-rise" style={riseDelay(0, 450)}>
          <p className="hiw-body" style={{ marginBottom: 24 }}>{HOW_IT_WORKS.pricing.body}</p>
          <div className="hiw-formula" role="figure" aria-label={HOW_IT_WORKS.sections.pricing}>
            <span>{HOW_IT_WORKS.formula.identity}</span>
            <span>{HOW_IT_WORKS.formula.cost}</span>
            <span>{HOW_IT_WORKS.formula.payout}</span>
          </div>
          <dl className="hiw-params">
            {QUOTE_FIELDS.map(([key, meaning]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>: {meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="hiw-foot">{HOW_IT_WORKS.pricing.foot}</p>
        </div>
      </section>

      <section className="hiw-section" aria-label={HOW_IT_WORKS.sections.fees}>
        <h2 className="hiw-label">{HOW_IT_WORKS.sections.fees}</h2>
        <div className="hiw-card hiw-card-wide hiw-fees hiw-rise" style={riseDelay(0, 500)}>
          {FEES.map((fee) => (
            <div key={fee.title}>
              <h3 className="hiw-fee-title">{fee.title}</h3>
              <p className="hiw-body">{fee.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
