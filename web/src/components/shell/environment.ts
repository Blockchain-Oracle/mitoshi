"use client";
// Ported from Owarine 90a91d71:web/src/components/shell/app/environment.ts (R4-8, D-227): which world you are in, as
// `<html data-mode>` — `demo` signed out (paper dollars on live prices), `testnet` signed in (Tempo Moderato test
// dollars). The canvas and the rail take the world's colour (app-shell.css); a change floods out from the control that
// made it (the rail's account, the Sign in button, the phone's avatar) through a view transition — roy-chain's D100
// flood. Instant without view transitions or under reduced motion; the phone's browser bar follows the new ground.
import { useEffect, useRef } from "react";
import { syncThemeColor } from "@/lib/theme";

export type EnvironmentMode = "demo" | "testnet";

/** The control a change floods out from, whichever is on screen. */
function floodOrigin(): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-flood-origin]")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

function flood(to: EnvironmentMode): void {
  const root = document.documentElement;
  const paint = () => {
    root.setAttribute("data-mode", to);
    syncThemeColor();
  };
  const r = floodOrigin();
  if (r) {
    root.style.setProperty("--flood-x", `${Math.round(r.left + r.width / 2)}px`);
    root.style.setProperty("--flood-y", `${Math.round(r.top + r.height / 2)}px`);
  }
  if (typeof document.startViewTransition !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    paint();
    return;
  }
  root.classList.add("mode-flooding");
  void document.startViewTransition(paint).finished.finally(() => root.classList.remove("mode-flooding"));
}

/**
 * Keeps `<html data-mode>` on the session while the shell is mounted. While a session is still restoring (`settling`)
 * nothing changes, so a returning account never flashes the demo colours; the first settled answer paints at once; a
 * later change — signing in or out — floods. Leaving the shell (the landing) takes the attribute off.
 */
export function useEnvironment(mode: EnvironmentMode, settling: boolean): void {
  const settledOnce = useRef(false);
  useEffect(() => {
    if (settling) return;
    const root = document.documentElement;
    const current = root.getAttribute("data-mode");
    if (!settledOnce.current || current === null) {
      root.setAttribute("data-mode", mode);
      syncThemeColor();
    } else if (current !== mode) flood(mode);
    settledOnce.current = true;
  }, [mode, settling]);
  useEffect(
    () => () => {
      document.documentElement.removeAttribute("data-mode");
      syncThemeColor();
    },
    [],
  );
}
