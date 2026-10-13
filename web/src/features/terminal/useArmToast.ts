"use client";
// R4-3 (D-227), lifted out of TerminalScreen: after the first passkey-prompted open, one toast a session — "One-tap is
// off · Turn on" — whose action opens the arm modal itself (`TapArmModal`, no hidden trigger). A fresh fill
// (`usePendingFills`) is a trade this tab just opened.
import { useEffect, useRef } from "react";
import { notify } from "@/lib/toast";
import { TERMINAL } from "./copy";

const ARM_TOAST_KEY = "cwf.terminal.oneTapToast";

export function useArmToast(fills: number, needsArm: boolean, openArm: () => void): void {
  const fillsSeen = useRef(fills);
  useEffect(() => {
    const grew = fills > fillsSeen.current;
    fillsSeen.current = fills;
    if (!grew || !needsArm) return;
    try {
      if (window.sessionStorage.getItem(ARM_TOAST_KEY)) return;
      window.sessionStorage.setItem(ARM_TOAST_KEY, "1");
    } catch {
      // No session storage (a private window): the toast still says it once per mount.
    }
    notify.item({ id: "terminal-one-tap", title: TERMINAL.arm.toastTitle, action: { label: TERMINAL.arm.toastAction, onClick: openArm } });
  }, [fills, needsArm, openArm]);
}
