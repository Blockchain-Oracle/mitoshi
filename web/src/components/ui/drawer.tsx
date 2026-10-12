"use client";

// From 21st.dev 31360 wensity/drawer — revamped per D-044 onto Base UI Drawer: from 768 px the right-edge slide-over
// (`swipeDirection="right"`, Popup moves by `--drawer-swipe-movement-x`); under 768 px Owarine 90a91d71 `kit/Sheet.tsx`'s
// bottom sheet (P6, D-224): `swipeDirection="down"`, a grab bar, drag to dismiss, at least half the screen. One
// component, so every drawer in the app — the terminal's, the ticket's, Everything — turns into a sheet on a phone.
// R4-2 (D-227) folds in the rest of Owarine's Sheet props: a `footer` pinned outside the scroll (and `SheetFooter`, which
// moves a body's own action bar into it), `size` md | lg, `onBack` / `headerLeft`, Back closes it (`urlKey`, D-190), the
// phone keyboard lifts the footer (Base UI `VirtualKeyboardProvider`), and a sheet with fields drags only from its grab
// bar. Desktop keeps the right drawer (D-222). The motion and scrim live in `styles/drawer.css` (no px in component code).
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { ChevronLeft, X } from "lucide-react";
import { createContext, useContext, useState, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SHELL } from "@/lib/copy";
import { dropDrawerParam, useUrlOverlay } from "@/lib/drawer-param";
import { usePhoneLayout } from "@/lib/phone-layout";
import { cn } from "@/lib/utils";

export interface SlideOverProps extends Omit<ComponentPropsWithoutRef<typeof BaseDrawer.Root>, "swipeDirection" | "onOpenChange" | "children"> {
  onOpenChange?: (open: boolean) => void;
  /** Carry the open state in the URL as `?d=<urlKey>` (D-190): Back closes the sheet, a reload or a link reopens it. */
  urlKey?: string;
  children: ReactNode;
}

/** The drawer: swipe right (a phone: down) or press Escape to close; focus trap and scroll lock from Base UI. */
export function SlideOver({ onOpenChange, urlKey, open, modal = true, children, ...props }: SlideOverProps) {
  const phone = usePhoneLayout();
  const url = useUrlOverlay(urlKey, open, onOpenChange);
  return (
    <BaseDrawer.Root swipeDirection={phone ? "down" : "right"} modal={modal} open={url.open} onOpenChange={url.onOpenChange ? (next) => url.onOpenChange?.(next) : undefined} {...props}>
      {children}
    </BaseDrawer.Root>
  );
}

export const SlideOverTrigger = BaseDrawer.Trigger;
export const SlideOverClose = BaseDrawer.Close;

/** The open overlay's pinned footer, for `SheetFooter` (null outside a sheet or a modal). */
export const OverlayFooterSlot = createContext<HTMLElement | null>(null);

/**
 * A body's own action bar (the ticket's CTA dock, a sheet's Confirm): inside a sheet or a modal it renders in the pinned
 * footer, outside the scroll and above a phone's keyboard; anywhere else (the ticket on the rail) in place.
 */
export function SheetFooter({ children }: { children: ReactNode }) {
  const slot = useContext(OverlayFooterSlot);
  return slot ? createPortal(children, slot) : <>{children}</>;
}

/** Before a link inside the sheet (or a modal) navigates, drop `?d=` so Back from the new page doesn't reopen it (D-190). */
export function dropOnLeave(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self")) return;
  const to = new URL(link.href, window.location.href);
  if (to.origin === window.location.origin && to.pathname !== window.location.pathname) dropDrawerParam();
}

export interface SlideOverContentProps {
  title: ReactNode;
  description?: ReactNode;
  /** A small label over the title (the modal's eyebrow when a modal is a phone sheet). */
  eyebrow?: ReactNode;
  /** Visually hide the heading when the body carries its own (the title stays for assistive tech). */
  hideHeading?: boolean;
  /** Keep the panel mounted while closed (hidden), so reopening is instant and keeps its state (the ticket, §3.2). */
  keepMounted?: boolean;
  /** Pinned under the scrolling body (Owarine kit Sheet): the primary action never scrolls away. */
  footer?: ReactNode;
  /** `md` (384 px drawer, 28 rem sheet) or `lg` for tables and wide controls (560 px, 40 rem). */
  size?: "md" | "lg";
  /** A back arrow at the head's left (a sheet's second step). */
  onBack?: () => void;
  /** Anything else at the head's left (a gear, a search) when there is no back arrow. */
  headerLeft?: ReactNode;
  /** The body holds text or amount fields, a hold or a slider: on a phone the sheet drags only from its grab bar. */
  fields?: boolean;
  /** Without it the close button is gone and nothing dismisses the sheet (a ceremony mid-way). */
  dismissible?: boolean;
  /** Open without the entry animation (it replaces an identical server-rendered cover). */
  instant?: boolean;
  /** `modal`: a modal shown as a phone sheet keeps the modal layer (D-226 scale: sheets < palette < modals). */
  layer?: "drawer" | "modal";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function SlideOverContent({ title, description, eyebrow, hideHeading = false, keepMounted = false, footer, size = "md", onBack, headerLeft, fields = false, dismissible = true, instant = false, layer = "drawer", className, bodyClassName, children }: SlideOverContentProps) {
  const phone = usePhoneLayout();
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  // A sheet with fields drags only from its grab bar; one that must not be dismissed does not drag at all (Base UI reads
  // the attribute with `closest`, so on the popup it covers everything inside).
  const pinned = fields ? "" : undefined;
  const left = onBack ? (
    <button type="button" className="slide-over-back" aria-label={SHELL.back} title={SHELL.back} onClick={onBack}>
      <ChevronLeft aria-hidden className="size-4" />
    </button>
  ) : headerLeft;
  const portal = (
    <BaseDrawer.Portal keepMounted={keepMounted}>
      <BaseDrawer.Backdrop className={cn("slide-over-backdrop", layer === "modal" && "on-modal")} />
      <BaseDrawer.Viewport className={cn("slide-over-viewport", layer === "modal" && "on-modal")}>
        <BaseDrawer.Popup className={cn("slide-over-popup", instant && "is-instant", className)} data-size={size} data-base-ui-swipe-ignore={dismissible ? undefined : ""}>
          <span aria-hidden className="slide-over-grab" />
          <BaseDrawer.Content className="slide-over-content">
            <div className={cn("slide-over-head", hideHeading && "sr-only", left ? "has-left" : null)}>
              {eyebrow ? (
                <span className="slide-over-eyebrow">
                  <span aria-hidden className="slide-over-eyebrow-dot" />
                  {eyebrow}
                </span>
              ) : null}
              <BaseDrawer.Title className="type-title text-ink">{title}</BaseDrawer.Title>
              {description ? <BaseDrawer.Description className="type-caption text-ink-secondary">{description}</BaseDrawer.Description> : null}
            </div>
            {left ? <div className="slide-over-left">{left}</div> : null}
            <OverlayFooterSlot.Provider value={slot}>
              <div className={cn("slide-over-body", bodyClassName)} data-base-ui-swipe-ignore={pinned} onClickCapture={dropOnLeave}>
                {children}
              </div>
            </OverlayFooterSlot.Provider>
            <div ref={setSlot} className="slide-over-foot" data-base-ui-swipe-ignore={pinned} onClickCapture={dropOnLeave}>
              {footer}
            </div>
            {dismissible ? (
              <BaseDrawer.Close className="slide-over-close" aria-label={SHELL.close} title={SHELL.close}>
                <X aria-hidden className="size-4" />
              </BaseDrawer.Close>
            ) : null}
          </BaseDrawer.Content>
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
  // Phones: the software keyboard (Base UI drawer docs, "Virtual keyboard aware") — the focused field is scrolled into
  // view and `--drawer-keyboard-inset` lifts the pinned footer above the keyboard.
  return phone ? <BaseDrawer.VirtualKeyboardProvider>{portal}</BaseDrawer.VirtualKeyboardProvider> : portal;
}
