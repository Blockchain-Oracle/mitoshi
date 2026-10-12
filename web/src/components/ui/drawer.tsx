"use client";

// From 21st.dev 31360 wensity/drawer — revamped per D-044 onto Base UI Drawer: from 768 px the right-edge slide-over
// (`swipeDirection="right"`, Popup moves by `--drawer-swipe-movement-x`); under 768 px Owarine 90a91d71 `kit/Sheet.tsx`'s
// bottom sheet (P6, D-224): `swipeDirection="down"`, a grab bar, drag to dismiss, at least half the screen. One
// component, so every drawer in the app — the terminal's, the ticket's, Everything — turns into a sheet on a phone.
// The motion and scrim live in `styles/drawer.css` (no px in component code).
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { usePhoneLayout } from "@/lib/phone-layout";
import { cn } from "@/lib/utils";

export interface SlideOverProps extends Omit<ComponentPropsWithoutRef<typeof BaseDrawer.Root>, "swipeDirection" | "onOpenChange" | "children"> {
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/** The drawer: swipe right (a phone: down) or press Escape to close; focus trap and scroll lock from Base UI. */
export function SlideOver({ onOpenChange, modal = true, children, ...props }: SlideOverProps) {
  const phone = usePhoneLayout();
  return (
    <BaseDrawer.Root swipeDirection={phone ? "down" : "right"} modal={modal} onOpenChange={onOpenChange ? (open) => onOpenChange(open) : undefined} {...props}>
      {children}
    </BaseDrawer.Root>
  );
}

export const SlideOverTrigger = BaseDrawer.Trigger;
export const SlideOverClose = BaseDrawer.Close;

export interface SlideOverContentProps {
  title: ReactNode;
  description?: ReactNode;
  /** Visually hide the heading when the body carries its own (the title stays for assistive tech). */
  hideHeading?: boolean;
  /** Keep the panel mounted while closed (hidden), so reopening is instant and keeps its state (the ticket, §3.2). */
  keepMounted?: boolean;
  className?: string;
  children: ReactNode;
}

export function SlideOverContent({ title, description, hideHeading = false, keepMounted = false, className, children }: SlideOverContentProps) {
  return (
    <BaseDrawer.Portal keepMounted={keepMounted}>
      <BaseDrawer.Backdrop className="slide-over-backdrop" />
      <BaseDrawer.Viewport className="slide-over-viewport">
        <BaseDrawer.Popup className={cn("slide-over-popup", className)}>
          <span aria-hidden className="slide-over-grab" />
          <BaseDrawer.Content className="slide-over-content">
            <div className={cn("slide-over-head", hideHeading && "sr-only")}>
              <BaseDrawer.Title className="type-title text-ink">{title}</BaseDrawer.Title>
              {description ? <BaseDrawer.Description className="type-caption text-ink-secondary">{description}</BaseDrawer.Description> : null}
            </div>
            <div className="slide-over-body">{children}</div>
            <BaseDrawer.Close className="slide-over-close" aria-label={SHELL.close}>
              <X aria-hidden className="size-4" />
            </BaseDrawer.Close>
          </BaseDrawer.Content>
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
}
