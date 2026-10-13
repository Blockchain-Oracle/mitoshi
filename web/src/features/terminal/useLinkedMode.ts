"use client";
// The terminal's mode, and the one a link opens (R4-13a, D-227): `?mode=` opens a mode and `?pick=` its side — More's
// "Short" is Boost on DOWN, the deployed reserve. The side belongs to the mode the link opened: a mode the reader picks,
// or closing it, drops it (state and URL), so it never preselects a side in another mode or on a reload.
import type { Side } from "@cwf/core";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MODES, type TerminalMode } from "./ui/ModePanel";
import { MODE_PARAM, PICK_PARAM, replaceTradeParams } from "./useTerminalWindow";

/** `reveal` runs when a mode other than Up/Down opens (the phone's drawer). */
export function useLinkedMode(reveal: () => void) {
  const params = useSearchParams();
  const [mode, setMode] = useState<TerminalMode>("updown");
  const [pickedSide, setPickedSide] = useState<Side | null>(() => {
    const p = params.get(PICK_PARAM);
    return p === "up" || p === "down" ? p : null;
  });
  const choose = (m: TerminalMode, fromLink = false) => {
    setMode(m);
    if (!fromLink) setPickedSide(null);
    replaceTradeParams(fromLink ? { mode: m === "updown" ? null : m } : { mode: m === "updown" ? null : m, pick: null });
    if (m !== "updown") reveal();
  };
  const close = () => {
    setMode("updown");
    setPickedSide(null);
    replaceTradeParams({ mode: null, pick: null });
  };
  const asked = useRef(params.get(MODE_PARAM));
  useEffect(() => {
    const m = asked.current;
    asked.current = null;
    if (m && m !== "updown" && (MODES as readonly string[]).includes(m)) choose(m as TerminalMode, true);
  }); // once: the ref is cleared on the first run
  return { mode, pickedSide, choose: (m: TerminalMode) => choose(m), close };
}
