"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/sheets/{Tutorial.tsx,tour-copy.ts} — a large centred modal
// (D-190) instead of a full-screen glass sheet; the illustrations drawn on Mitoshi's chart tokens with CSS (no motion
// runtime); and the last step ends in the real sign-up (D-191: "Start trading" → passkey → faucet-funded testnet
// account) or "Look around first" — no demo, no simulated balance.
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import { TourNav, TourStepBody } from "./TourStep";

/** `instant`: it replaces the server-rendered `TourCover`, so it appears without the modal's entry animation. */
export function Tutorial({ open, onDone, instant = false }: { open: boolean; onDone: (choice: "start" | "later" | "skip") => void; instant?: boolean }) {
  const [step, setStep] = useState(0);
  const steps = TERMINAL.tour.steps;
  const s = steps[step]!;
  const last = step === steps.length - 1;
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
      instant={instant}
      eyebrow={TERMINAL.tour.label}
      title={s.title}
      footer={
        last ? (
          <>
            <button type="button" className="tm-btn tm-btn-cta" onClick={() => finish("start")}>{TERMINAL.tour.start}</button>
            <button type="button" className="tm-btn tm-btn-cta is-quiet" onClick={() => finish("later")}>{TERMINAL.tour.later}</button>
          </>
        ) : (
          <TourNav
            step={step}
            back={<button type="button" className="tm-choice" onClick={() => (step === 0 ? finish("skip") : (tapFeedback(), setStep(step - 1)))}>{step === 0 ? TERMINAL.tour.skip : TERMINAL.tour.back}</button>}
            next={<button type="button" className="tm-btn tm-btn-cta tm-tour-next" onClick={() => (tapFeedback(), setStep(step + 1))}>{TERMINAL.tour.next}</button>}
          />
        )
      }
    >
      <TourStepBody step={step} />
    </Modal>
  );
}
