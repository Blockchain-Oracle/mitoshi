import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import "@/styles/how-it-works.css";
import { HOW_IT_WORKS } from "./copy";
import { Faq } from "./Faq";
import { Mechanics } from "./Mechanics";
import { riseDelay } from "./rise";
import { Settlement } from "./Settlement";
import { Steps } from "./Steps";

/** Where "Back" and the CTA go: the terminal, the app's one screen. */
const TERMINAL_PATH = "/trade/BTC";

/**
 * /how-it-works (L-12) — Ported from Masayume 68f7a09:web/src/features/how-it-works/HowItWorksPage.tsx, itself from
 * `reference/yosuku/app/how-it-works/page.tsx`; Mitoshi's facts live in `content.ts` and `copy.ts`.
 *
 * The structure is the reference's, section for section: back link, hero, getting
 * started, a worked payout example, key mechanics, the pricing model, fees, the
 * settlement process, the on-chain architecture, FAQ, and the CTA. Every protocol
 * fact under those headings is DreamDEX Event Contracts on Somnia, sourced in
 * `content.ts`; nothing about the reference's SVI vault survives, because it is not
 * how this venue prices.
 *
 * The reference mounts its own Header and a `router.push` back button; the root
 * shell already carries the chrome, and the back control is a plain link.
 */
export function HowItWorksPage() {
  return (
    <div className="hiw">
      <div className="hiw-glows" aria-hidden>
        <div className="hiw-glow-mint" />
        <div className="hiw-glow-blue" />
      </div>

      <div className="hiw-main">
        <div className="hiw-wrap">
          <Link href={TERMINAL_PATH} className="hiw-back" data-cursor="hover">
            <ArrowLeftIcon className="hiw-back-arrow" aria-hidden />
            {HOW_IT_WORKS.back}
          </Link>

          <header className="hiw-hero hiw-rise">
            <h1 className="hiw-title">{HOW_IT_WORKS.title}</h1>
            <p className="hiw-lead">{HOW_IT_WORKS.lead}</p>
          </header>

          <Steps />
          <Mechanics />
          <Settlement />
          <Faq />

          <section className="hiw-card hiw-card-mint hiw-cta hiw-rise" style={riseDelay(0, 700)} aria-label={HOW_IT_WORKS.cta.title}>
            <h2 className="hiw-cta-title">{HOW_IT_WORKS.cta.title}</h2>
            <p className="hiw-cta-body">{HOW_IT_WORKS.cta.body}</p>
            <Link href={TERMINAL_PATH} className="hiw-cta-button" data-cursor="hover">
              {HOW_IT_WORKS.cta.action}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
