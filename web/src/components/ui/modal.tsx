"use client";

// From 21st.dev 31359 wensity/dialog — revamped per D-044 onto Masayume's one overlay grammar (`styles/modal.css`: a
// centred panel over a blurred scrim, head / scrolling body / footer that never leaves the screen). Base UI Dialog
// gives focus trap, Escape, scroll lock and `aria-modal`; the close button is 44 px; motion is opacity + a small
// scale in CSS (`data-starting/ending-style`), off under reduced motion. Under 768 px it is a bottom sheet with a grab
// bar (Owarine's one overlay on phones; P6, D-224), the same DOM.
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { useModalSignal } from "@/lib/modal-signal";
import { cn } from "@/lib/utils";

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
  className?: string;
  children?: ReactNode;
}

export function Modal({ open, onOpenChange, title, description, eyebrow, footer, dismissible = true, instant = false, className, children }: ModalProps) {
  useModalSignal(open);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (dismissible || next ? onOpenChange(next) : undefined)}>
      <Dialog.Portal>
        <Dialog.Backdrop className={cn("modal-scrim modal-anim", instant && "modal-instant")} />
        <Dialog.Viewport className="modal-root">
          <Dialog.Popup className={cn("modal modal-anim", instant && "modal-instant", className)}>
            <span aria-hidden className="modal-grab" />
            {dismissible ? (
              <Dialog.Close className="modal-close grid size-touch place-items-center" aria-label={SHELL.close}>
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
            {children ? <div className="modal-body">{children}</div> : null}
            {footer ? <div className="modal-foot">{footer}</div> : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalClose = Dialog.Close;
