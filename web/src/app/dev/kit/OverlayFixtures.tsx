"use client";
// The overlay grammar (R4-2, D-227): a sheet with a pinned footer, the wide size, a back step, a field (drags only from its
// grab bar; the footer rides the phone keyboard), Back closing it (`?d=`), and a modal that is a sheet on a phone with a
// body action moved into its footer. Desktop keeps the right drawer and the centred modal (D-222). Fixture inputs only.
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { PillButton } from "@/components/kit/PillButton";
import { SheetFooter, SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { closeDrawer, openDrawer } from "@/lib/drawer-param";
import { Fixture } from "./KitFixtures";
import "@/components/kit/kit.css";

export function OverlayFixtures() {
  const [step, setStep] = useState<1 | 2>(1);
  const [wide, setWide] = useState(false);
  const [modal, setModal] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Fixture index="09" title="Sheet · Modal">
      <div className="flex flex-wrap gap-3">
        <PillButton tone="accent" onClick={() => openDrawer("kit-sheet")}>Open the sheet (?d=kit-sheet)</PillButton>
        <PillButton tone="ghost" onClick={() => setWide(true)}>Open the wide sheet</PillButton>
        <PillButton tone="ghost" onClick={() => setModal(true)}>Open the modal</PillButton>
      </div>

      <SlideOver urlKey="kit-sheet">
        <SlideOverContent
          title={step === 1 ? "A sheet" : "Its second step"}
          description="Back closes it."
          fields
          onBack={step === 2 ? () => setStep(1) : undefined}
          footer={
            step === 1 ? (
              <PillButton tone="accent" size="lg" block onClick={() => setStep(2)}>Next</PillButton>
            ) : (
              <PillButton tone="accent" size="lg" block onClick={() => (setStep(1), closeDrawer())}>Done</PillButton>
            )
          }
        >
          <label className="flex flex-col gap-2">
            <span className="type-caption text-ink-secondary">A field — focus it on a phone; the footer rides the keyboard.</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="h-12 rounded-md border border-hairline bg-surface-1 px-3 type-body text-ink" />
          </label>
          {Array.from({ length: 12 }, (_, i) => (
            <p key={i} className="py-2 type-body text-ink-secondary">Row {i + 1} of a body long enough to scroll under the pinned footer.</p>
          ))}
        </SlideOverContent>
      </SlideOver>

      <SlideOver open={wide} onOpenChange={setWide} urlKey="kit-wide">
        <SlideOverContent title="The wide sheet" size="lg">
          <p className="type-body text-ink-secondary">`size=&quot;lg&quot;`: 560 px as a drawer, 40 rem as a phone sheet.</p>
        </SlideOverContent>
      </SlideOver>

      <Modal open={modal} onOpenChange={setModal} eyebrow="Modal" title="A modal" description="A sheet on a phone, centred from 768 px." urlKey="kit-modal">
        <p className="type-body text-ink-secondary">The action below is written in the body and lands in the footer.</p>
        <SheetFooter>
          <PillButton tone="accent" size="lg" block onClick={() => setModal(false)}>Confirm</PillButton>
        </SheetFooter>
      </Modal>
    </Fixture>
  );
}
