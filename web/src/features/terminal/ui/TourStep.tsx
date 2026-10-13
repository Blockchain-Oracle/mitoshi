// The tour's step body and its nav row (Owarine ecb7565b:web/src/features/terminal/ui/sheets/Tutorial.tsx), shared by
// the real tour (`Tutorial`, a Base UI modal in the lazy screen) and `TourCover`, its first step server-rendered under
// the splash so a first visitor reads it the moment the splash lifts (S23 gate, F-S23-08: the tour's text was the
// page's LCP at ~7 s, waiting on the screen's script). No Base UI here: the cover ships with the eager page.
import { ArrowDown, ArrowUp, ArrowUpRight, LineChart, Waves, X } from "lucide-react";
import type { ReactNode } from "react";
import { TERMINAL } from "../copy";

const ICONS = [LineChart, ArrowUp, Waves, ArrowUpRight, X] as const;
const PATH = "M8 120 C 50 110, 70 70, 110 80 S 170 40, 210 52 S 260 30, 292 26";

/** The step illustrations: a line, the two buttons, the line with its value pill, a trailing stop, Close. */
function Illustration({ step }: { step: number }) {
  return (
    <div className="tm-tour-art" aria-hidden>
      {step === 1 ? (
        <div className="tm-tour-buttons">
          <span className="tm-btn tm-up-soft"><ArrowUp strokeWidth={3} />UP</span>
          <span className="tm-btn tm-down-soft"><ArrowDown strokeWidth={3} />DOWN</span>
        </div>
      ) : (
        <svg viewBox="0 0 300 150" className="tm-tour-svg">
          {step === 3 ? <line x1="8" x2="292" y1="78" y2="78" className="tm-tour-trail" /> : null}
          <path d={PATH} className="tm-tour-line" pathLength={1} />
          <circle cx="292" cy="26" r="4" className="tm-tour-head" />
        </svg>
      )}
      {step === 2 || step === 4 ? <span className="tm-tour-pill">+$4.20</span> : null}
      {step === 3 ? <span className="tm-tour-chip tm-up-solid"><ArrowUpRight />{TERMINAL.buttons.trailing}</span> : null}
      {step === 4 ? <span className="tm-tour-chip tm-tour-close"><X />{TERMINAL.buttons.close}</span> : null}
    </div>
  );
}

export function TourStepBody({ step }: { step: number }) {
  const Icon = ICONS[step]!;
  return (
    <div key={step} className="tm-tour-step tm-swap">
      <Illustration step={step} />
      <span className="tm-tour-kicker"><Icon aria-hidden />{TERMINAL.tour.step(step + 1)}</span>
      <p className="tm-tour-body">{TERMINAL.tour.steps[step]!.body}</p>
      <p className="tm-field-hint">{TERMINAL.tour.network}</p>
    </div>
  );
}

/** Skip / Back · the dots · Next. */
export function TourNav({ step, back, next }: { step: number; back: ReactNode; next: ReactNode }) {
  return (
    <div className="tm-tour-nav">
      {back}
      <div className="tm-tour-dots" aria-hidden>
        {TERMINAL.tour.steps.map((_, i) => <span key={i} data-on={i === step ? "" : undefined} />)}
      </div>
      {next}
    </div>
  );
}

/**
 * Marks the page before first paint when this browser has seen the tour (the trade settings' `tutorialSeen`), or when
 * the terminal runs in a frame (the landing's phone, which shows the app rather than teaches it).
 */
export const TOUR_SEEN_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("cwf.trade.settings.v1")||"{}");if(window.self!==window.top||(s&&s.tutorialSeen===true)||/[?&]tour=0(&|$)/.test(location.search))document.documentElement.setAttribute("data-tm-tour-seen","")}catch(e){}`;

/**
 * The tour's first step as the modal paints it (`modal-scrim` / `modal-root` / `modal tm-tour`) and, under 768 px, as the
 * phone sheet paints it (`slide-over-*`: a modal is the sheet on a phone, R4-2), server-rendered and hidden before paint
 * for a browser that has seen the tour. The real tour replaces it, without an entry animation, as soon as the screen
 * mounts; until then the cover's buttons are drawn but inert (the splash covers most of that wait).
 */
export function TourCover() {
  const step = TERMINAL.tour.steps[0]!;
  const nav = <TourNav step={0} back={<span className="tm-choice">{TERMINAL.tour.skip}</span>} next={<span className="tm-btn tm-btn-cta tm-tour-next">{TERMINAL.tour.next}</span>} />;
  return (
    <div className="tm-tour-cover" aria-hidden>
      <div className="modal-scrim" />
      <div className="modal-root tm-tour-cover-wide">
        <div className="modal tm-tour">
          <div className="modal-head">
            <div className="modal-eyebrow-row">
              <span className="modal-eyebrow-dot" />
              <span className="modal-eyebrow">{TERMINAL.tour.label}</span>
            </div>
            <h2 className="modal-title">{step.title}</h2>
          </div>
          <div className="modal-body"><TourStepBody step={0} /></div>
          <div className="modal-foot">{nav}</div>
        </div>
      </div>
      <div className="slide-over-viewport tm-tour-cover-phone">
        <div className="slide-over-popup is-modal tm-tour" data-size="md">
          <span className="slide-over-grab" />
          <div className="slide-over-content">
            <div className="slide-over-head">
              <span className="slide-over-eyebrow"><span className="slide-over-eyebrow-dot" />{TERMINAL.tour.label}</span>
              <h2 className="type-title text-ink">{step.title}</h2>
            </div>
            <div className="slide-over-body slide-over-body--stack"><TourStepBody step={0} /></div>
            <div className="slide-over-foot">{nav}</div>
            <span className="slide-over-close"><X className="size-4" /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
