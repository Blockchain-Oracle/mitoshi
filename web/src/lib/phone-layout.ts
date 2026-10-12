"use client";
/**
 * Phones are where overlays become bottom sheets (Owarine 90a91d71 `kit/Sheet.tsx`; P6, D-224) and the sign-in list
 * its mobile layout (RainbowKit's 767 px breakpoint). In rem because component code carries no px literals; the CSS
 * mirrors it. The server renders the wide layout; the sheet only ever opens client-side.
 */
import { useSyncExternalStore } from "react";

export const PHONE_QUERY = "(max-width: 47.9375rem)";

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
