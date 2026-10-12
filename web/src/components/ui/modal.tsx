"use client";

// From 21st.dev 31359 wensity/dialog — revamped per D-044 onto Masayume's one overlay grammar (`styles/modal.css`: a
// centred panel over a blurred scrim, head / scrolling body / footer that never leaves the screen). Base UI Dialog
// gives focus trap, Escape, scroll lock and `aria-modal`; the close button is 44 px; motion is opacity + a small
// scale in CSS (`data-starting/ending-style`), off under reduced motion. R4-2 (D-227): under 768 px a modal IS the
// sheet — it renders through `SlideOver` (Owarine 90a91d71 `kit/Sheet.tsx`) with the same title, eyebrow and footer, so
// every phone overlay drags to dismiss and lifts its footer over the keyboard; from 768 it stays the centred Dialog
// (D-190, D-222). `urlKey` ties either to `?d=` so Back closes it; `SheetFooter` in the body lands in the footer.
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { useUrlOverlay } from "@/lib/drawer-param";
import { useModalSignal } from "@/lib/modal-signal";
import { usePhoneLayout } from "@/lib/phone-layout";
import { cn } from "@/lib/utils";
import { OverlayFooterSlot, SlideOver, SlideOverContent } from "./drawer";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  /** The sticky footer (the CTA lives here so it is always visible, §2.5). */
  footer?: ReactNode;
  /** Hide the close button while a ceremony must not be interrupted mid-way. */
  dismissible?: boolean;
  /** Open without the entry animation: it replaces an identical server-rendered cover (the terminal's first tour). */
  instant?: boolean;
  /** Carry the open state in the URL as `?d=<urlKey>` so Back closes it (D-190). */
  urlKey?: string;
  /** The body holds fields, a hold or a slider: as a phone sheet it drags only from its grab bar. */
  fields?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Modal({ open, onOpenChange, title, description, eyebrow, footer, dismissible = true, instant = false, urlKey, fields, className, children }: ModalProps) {
  useModalSignal(open);
  const phone = usePhoneLayout();
  const url = useUrlOverlay(urlKey, open, onOpenChange);
  const change = (next: boolean) => (dismissible || next ? url.onOpenChange?.(next) : undefined);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  if (phone) {
    return (
      <SlideOver open={open} onOpenChange={change}>
        <SlideOverContent title={title} description={description} eyebrow={eyebrow} footer={footer} dismissible={dismissible} instant={instant} fields={fields} layer="modal" className={cn("is-modal", className)} bodyClassName="slide-over-body--stack">
          {children}
        </SlideOverContent>
      </SlideOver>
    );
  }
  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cn("modal-scrim modal-anim", instant && "modal-instant")} />
        <Dialog.Viewport className="modal-root">
          <Dialog.Popup className={cn("modal modal-anim", instant && "modal-instant", className)}>
            {dismissible ? (
              <Dialog.Close className="modal-close grid size-touch place-items-center" aria-label={SHELL.close} title={SHELL.close}>
                <X aria-hidden className="size-4" />
              </Dialog.Close>
            ) : null}
            <div className="modal-head">
              {eyebrow ? (
                <div className="modal-eyebrow-row">
                  <span className="modal-eyebrow-dot" aria-hidden />
                  <span className="modal-eyebrow">{eyebrow}</span>
                </div>
              ) : null}
              <Dialog.Title className="modal-title">{title}</Dialog.Title>
              {description ? <Dialog.Description className="modal-desc">{description}</Dialog.Description> : null}
            </div>
            <OverlayFooterSlot.Provider value={slot}>{children ? <div className="modal-body">{children}</div> : null}</OverlayFooterSlot.Provider>
            <div ref={setSlot} className="modal-foot">{footer}</div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalClose = Dialog.Close;
