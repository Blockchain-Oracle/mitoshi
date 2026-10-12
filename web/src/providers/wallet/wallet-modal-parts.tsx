"use client";
// Ported from Owarine 90a91d71:web/src/providers/wallet/wallet-modal-parts.tsx (O-9, D-222).


import { Dialog } from "@base-ui/react/dialog";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WALLET_MODAL } from "./copy";
import "./wallet-modal.css";

/** RainbowKit's mobile breakpoint (767 px), in rem because component code carries no px literals; the CSS mirrors it. */
const PHONE_QUERY = "(max-width: 47.9375rem)";

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** RainbowKit switched to its mobile layouts on phones; here that is the viewport width. The modal only opens client-side. */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/**
 * Our base-ui Dialog in RainbowKit's frame: blurred scrim, centred panel (bottom sheet on phones), slide-up entrance.
 * Focus lands on the panel itself, as RainbowKit's focus trap did, so no control shows a focus ring on open.
 */
export function WalletDialog({
  open,
  onOpenChange,
  compact = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compact?: boolean;
  children: ReactNode;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="wm-backdrop" />
        <Dialog.Viewport className="wm-viewport">
          <Dialog.Popup ref={popupRef} initialFocus={popupRef} className="wm-popup">
            <div className={cn("wm-panel", compact && "wm-panel--compact")}>{children}</div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// RainbowKit's own glyphs (Close, Back), so the chrome of the modal is unchanged.
function CloseIcon({ phone }: { phone: boolean }) {
  return phone ? (
    <svg aria-hidden="true" fill="none" height="11.5" viewBox="0 0 11.5 11.5" width="11.5">
      <path
        d="M2.13388 0.366117C1.64573 -0.122039 0.854272 -0.122039 0.366117 0.366117C-0.122039 0.854272 -0.122039 1.64573 0.366117 2.13388L3.98223 5.75L0.366117 9.36612C-0.122039 9.85427 -0.122039 10.6457 0.366117 11.1339C0.854272 11.622 1.64573 11.622 2.13388 11.1339L5.75 7.51777L9.36612 11.1339C9.85427 11.622 10.6457 11.622 11.1339 11.1339C11.622 10.6457 11.622 9.85427 11.1339 9.36612L7.51777 5.75L11.1339 2.13388C11.622 1.64573 11.622 0.854272 11.1339 0.366117C10.6457 -0.122039 9.85427 -0.122039 9.36612 0.366117L5.75 3.98223L2.13388 0.366117Z"
        fill="currentColor"
      />
    </svg>
  ) : (
    <svg aria-hidden="true" fill="none" height="10" viewBox="0 0 10 10" width="10">
      <path
        d="M1.70711 0.292893C1.31658 -0.0976311 0.683417 -0.0976311 0.292893 0.292893C-0.0976311 0.683417 -0.0976311 1.31658 0.292893 1.70711L3.58579 5L0.292893 8.29289C-0.0976311 8.68342 -0.0976311 9.31658 0.292893 9.70711C0.683417 10.0976 1.31658 10.0976 1.70711 9.70711L5 6.41421L8.29289 9.70711C8.68342 10.0976 9.31658 10.0976 9.70711 9.70711C10.0976 9.31658 10.0976 8.68342 9.70711 8.29289L6.41421 5L9.70711 1.70711C10.0976 1.31658 10.0976 0.683417 9.70711 0.292893C9.31658 -0.0976311 8.68342 -0.0976311 8.29289 0.292893L5 3.58579L1.70711 0.292893Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CloseButton({ phone = false }: { phone?: boolean }) {
  return (
    <Dialog.Close aria-label={WALLET_MODAL.close} className="wm-close wm-touch wm-grow-lg wm-shrink-sm">
      <CloseIcon phone={phone} />
    </Dialog.Close>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label={WALLET_MODAL.back} className="wm-back wm-touch wm-grow-lg wm-shrink-sm" onClick={onClick}>
      <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 11 17" width="11">
        <path
          d="M0.99707 8.6543C0.99707 9.08496 1.15527 9.44531 1.51562 9.79688L8.16016 16.3096C8.43262 16.5732 8.74902 16.7051 9.13574 16.7051C9.90918 16.7051 10.5508 16.0811 10.5508 15.3076C10.5508 14.9121 10.3838 14.5605 10.0938 14.2705L4.30176 8.64551L10.0938 3.0293C10.3838 2.74805 10.5508 2.3877 10.5508 2.00098C10.5508 1.23633 9.90918 0.603516 9.13574 0.603516C8.74902 0.603516 8.43262 0.735352 8.16016 0.999023L1.51562 7.51172C1.15527 7.85449 1.00586 8.21484 0.99707 8.6543Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}

type ActionProps = {
  label: string;
  secondary?: boolean;
  size?: "medium" | "large" | "small";
} & ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

/** RainbowKit's `ActionButton`: accent primary or surface secondary, a link when it downloads something. */
export function ActionButton({ label, secondary = false, size = "medium", href, onClick }: ActionProps) {
  const className = cn(
    "wm-action wm-touch wm-grow wm-shrink-sm",
    secondary && "wm-action--secondary",
    size === "large" && "wm-action--large",
    size === "small" && "wm-action--small",
  );
  if (href) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer noopener">
        {label}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {label}
    </button>
  );
}

/** RainbowKit's `SpinnerIcon`: a conic sweep clipped to a ring, turning every 3 s. */
export function Spinner() {
  return (
    <svg className="wm-spinner" fill="none" height="21" viewBox="0 0 21 21" width="21" role="img" aria-label={WALLET_MODAL.status.loading}>
      <clipPath id="wm-spinner-clip">
        <path d="M10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18C11.3284 18 12 18.6716 12 19.5C12 20.3284 11.3284 21 10.5 21C4.70101 21 0 16.299 0 10.5C0 4.70101 4.70101 0 10.5 0C16.299 0 21 4.70101 21 10.5C21 11.3284 20.3284 12 19.5 12C18.6716 12 18 11.3284 18 10.5C18 6.35786 14.6421 3 10.5 3Z" />
      </clipPath>
      <foreignObject clipPath="url(#wm-spinner-clip)" height="21" width="21" x="0" y="0">
        <div className="wm-spinner-fill" />
      </foreignObject>
    </svg>
  );
}

/** A wallet's icon at one of RainbowKit's sizes; Wallet Standard icons are data: URIs the wallet itself provides. */
export function WalletIcon({ src, size, ring = true }: { src: string; size: 28 | 44 | 48 | 60; ring?: boolean }) {
  return (
    <span className={cn("wm-icon", `wm-icon--${size}`, !ring && "wm-icon--plain")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} />
    </span>
  );
}
