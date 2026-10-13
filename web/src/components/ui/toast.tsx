"use client";
// Ported from Masayume 68f7a09:web/src/components/ui/toast.tsx
// S22 (D-190; revamp-parity RV-16): Tradash's toast grammar — top-centre at every width, a stack of three that peeks
// downward, in from above, swiped up (or ✕) to dismiss; the same id replaces a toast in place (Base UI `update`).
// R6 (D-230, T19): restyled on Mitoshi's tokens and type scale, not shadcn's — the plate is surface-3 (both themes come
// from the surface tokens, no `bg-neutral-900` remap), the title body-strong ink, the line caption ink-secondary, the
// action a kit pill and the close a 44 px target. A toast is for what happened elsewhere or later; the action you just
// took confirms in place (TxCta morphs into its receipt).

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { cn } from "@/lib/utils"
import { PillButton } from "@/components/kit/PillButton"
import { XIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const toast = ToastPrimitive.createToastManager()

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "toast-viewport-top pointer-events-none fixed inset-x-4 mx-auto w-auto max-w-sm outline-none",
        className
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      data-type={props.toast?.type}
      className={cn(
        // Ported surface: rounded-xl, a translucent raised surface + backdrop-blur-xl, type-tinted border
        // (styles/toast.css); surface-3 carries both themes.
        "toast-plate group/toast pointer-events-auto absolute inset-x-0 top-0 z-[calc(10-var(--toast-index))] w-full origin-top rounded-xl border border-border-strong bg-surface-3/95 text-ink backdrop-blur-xl will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_var(--ease-bounce),opacity_500ms,height_150ms]",
        "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+var(--spacing)/4)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        // Tradash's toasts spring in from above (y −60, damping 30 / stiffness 300); `--ease-bounce` is Yosuku's own
        // overshooting curve, which is what that spring reads as.
        "data-limited:opacity-0 data-starting-style:[transform:translateY(-150%)]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:opacity-0",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("type-body-strong text-ink", className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("type-caption text-ink-secondary", className)}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <PillButton tone="ink" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

function ToastClose({
  className,
  children,
  render = <button type="button" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Close toast"
      render={render}
      className={cn(
        "-my-2 -me-2 grid size-touch shrink-0 place-items-center rounded-full text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-4",
        className
      )}
      {...props}
    >
      {children ?? (
        <XIcon aria-hidden="true" />
      )}
    </ToastPrimitive.Close>
  )
}

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null

  // Ported from the reference's `colors` map: success emerald-400 and error rose-400 are
  // `--profit` and `--loss` to the byte, so the tokens carry it. The word in the message
  // always says the outcome too — the ink only echoes it (color law).
  if (type === "success") {
    icon = (
      <CircleCheckIcon className="text-profit" aria-hidden="true" />
    )
  }

  if (type === "info") {
    icon = (
      <InfoIcon className="text-ink-muted" aria-hidden="true" />
    )
  }

  if (type === "warning") {
    icon = (
      <TriangleAlertIcon className="text-warning" aria-hidden="true" />
    )
  }

  if (type === "error") {
    icon = (
      <OctagonXIcon className="text-loss" aria-hidden="true" />
    )
  }

  if (type === "loading") {
    icon = (
      <Loader2Icon className="animate-spin" aria-hidden="true" />
    )
  }

  if (!icon) {
    return null
  }

  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  )
}

// From 21st.dev 24297 cnippet-dev/toast — its position-derived swipe: the stack sits top-centre at every width (S22),
// so it swipes up everywhere, and right too from `sm`, where there is room to fling it aside.
// Tailwind v4's `sm` breakpoint (40rem), the one the viewport classes above switch on.
const SM_QUERY = "(min-width: 40rem)"
const subscribeSm = (onChange: () => void) => {
  const mq = window.matchMedia(SM_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  const wide = React.useSyncExternalStore(subscribeSm, () => window.matchMedia(SM_QUERY).matches, () => false)
  const swipeDirection: ("up" | "right")[] = wide ? ["up", "right"] : ["up"]

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem} swipeDirection={swipeDirection}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ))
}

function Toaster({
  children,
  toastManager = toast,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toast,
  useToastManager,
}
