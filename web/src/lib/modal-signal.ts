/**
 * Whether a centred modal is open (its scrim covers the page). The terminal's chart reads it each frame and draws only
 * a few frames a second behind one (S23 gate, F-S23-08/09): the first-visit tour sits over the chart, where a 60 Hz
 * canvas repaint is main-thread work no one can see. Drawers don't count — the chart stays in view beside them.
 */
import { useEffect, useSyncExternalStore } from "react";

let open = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const modalOpen = (): boolean => open > 0;

/** Re-renders while any modal opens or closes (R4-7: the earn action dock steps aside under one). */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    modalOpen,
    () => false,
  );
}

/** Registers an open modal for as long as `isOpen` holds. */
export function useModalSignal(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    open += 1;
    emit();
    return () => {
      open -= 1;
      emit();
    };
  }, [isOpen]);
}
