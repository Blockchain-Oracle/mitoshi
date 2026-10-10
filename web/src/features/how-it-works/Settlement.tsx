// Ported from Masayume 68f7a09:web/src/features/how-it-works/Settlement.tsx unchanged.
import { ShieldIcon } from "lucide-react";
import { ARCHITECTURE, SETTLEMENT_STEPS } from "./content";
import { HOW_IT_WORKS } from "./copy";
import { riseDelay } from "./rise";

/** The settlement process (reference L289–317) and the on-chain architecture cards (L319–375). */
export function Settlement() {
  const [first, second, third] = ARCHITECTURE;
  return (
    <>
      <section className="hiw-section" aria-label={HOW_IT_WORKS.sections.settlement}>
        <h2 className="hiw-label">{HOW_IT_WORKS.sections.settlement}</h2>
        <div className="hiw-card hiw-card-wide hiw-rise" style={riseDelay(0, 550)}>
          <ol className="hiw-steps">
            {SETTLEMENT_STEPS.map((item) => (
              <li key={item.step} className="contents">
                <div>
                  <span className="hiw-step-num" aria-hidden>
                    {item.step}
                  </span>
                  <div>
                    <div className="hiw-step-label">{item.label}</div>
                    <div className="hiw-body">{item.desc}</div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hiw-section" aria-label={HOW_IT_WORKS.sections.architecture}>
        <h2 className="hiw-label hiw-label-blue">
          <ShieldIcon aria-hidden />
          {HOW_IT_WORKS.sections.architecture}
        </h2>
        <div className="hiw-grid hiw-arch">
          {[first, second].map((card, index) =>
            card ? (
              <article key={card.title} className="hiw-card hiw-card-blue hiw-rise" style={riseDelay(index, 500)}>
                <div className="hiw-card-head">
                  <span className="hiw-icon" data-tone="blue" aria-hidden>
                    <card.icon />
                  </span>
                  <h3 className="hiw-card-title" style={{ marginBottom: 0 }}>
                    {card.title}
                  </h3>
                </div>
                <p className="hiw-body">{card.body}</p>
              </article>
            ) : null,
          )}
        </div>
        {third && (
          <article className="hiw-card hiw-card-blue hiw-rise" style={riseDelay(2, 500)}>
            <div className="hiw-card-head">
              <span className="hiw-icon" data-tone="blue" aria-hidden>
                <third.icon />
              </span>
              <h3 className="hiw-card-title" style={{ marginBottom: 0 }}>
                {third.title}
              </h3>
            </div>
            <p className="hiw-body">{third.body}</p>
          </article>
        )}
      </section>
    </>
  );
}
