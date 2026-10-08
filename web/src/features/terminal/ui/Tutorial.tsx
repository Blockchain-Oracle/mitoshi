"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/sheets/{Tutorial.tsx,tour-copy.ts} — a large centred modal
// (D-190) instead of a full-screen glass sheet; the illustrations drawn on Mitoshi's chart tokens with CSS (no motion
// runtime); and the last step ends in the real sign-up (D-191: "Start trading" → passkey → faucet-funded testnet
// account) or "Look around first" — no demo, no simulated balance.
import { ArrowDown, ArrowUp, ArrowUpRight, LineChart, Waves, X } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { tapFeedback } from "@/lib/feedback";
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

export function Tutorial({ open, onDone }: { open: boolean; onDone: (choice: "start" | "later" | "skip") => void }) {
  const [step, setStep] = useState(0);
  const steps = TERMINAL.tour.steps;
  const s = steps[step]!;
  const last = step === steps.length - 1;
  const Icon = ICONS[step]!;
  const finish = (choice: "start" | "later" | "skip") => {
    tapFeedback();
    setStep(0);
    onDone(choice);
  };
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && finish("skip")}
      className="tm-tour"
      eyebrow={TERMINAL.tour.label}
      title={s.title}
      footer={
        last ? (
          <>
            <button type="button" className="tm-btn tm-btn-cta" onClick={() => finish("start")}>{TERMINAL.tour.start}</button>
            <button type="button" className="tm-btn tm-btn-cta is-quiet" onClick={() => finish("later")}>{TERMINAL.tour.later}</button>
          </>
        ) : (
          <div className="tm-tour-nav">
            <button type="button" className="tm-choice" onClick={() => (step === 0 ? finish("skip") : (tapFeedback(), setStep(step - 1)))}>{step === 0 ? TERMINAL.tour.skip : TERMINAL.tour.back}</button>
            <div className="tm-tour-dots" aria-hidden>
              {steps.map((_, i) => <span key={i} data-on={i === step ? "" : undefined} />)}
            </div>
            <button type="button" className="tm-btn tm-btn-cta tm-tour-next" onClick={() => (tapFeedback(), setStep(step + 1))}>{TERMINAL.tour.next}</button>
          </div>
        )
      }
    >
      <div key={step} className="tm-tour-step tm-swap">
        <Illustration step={step} />
        <span className="tm-tour-kicker"><Icon aria-hidden />{TERMINAL.tour.step(step + 1)}</span>
        <p className="tm-tour-body">{s.body}</p>
        <p className="tm-field-hint">{TERMINAL.tour.network}</p>
      </div>
    </Modal>
  );
}
