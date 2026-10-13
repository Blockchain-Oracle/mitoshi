"use client";
/**
 * The software keyboard for an overlay that is not a Base UI drawer (Sensei's aside, Owarine 90a91d71
 * `features/sensei/SenseiDrawer.tsx`), R4-2 (D-227). Every sheet gets Base UI's `Drawer.VirtualKeyboardProvider`; this
 * is the same measure (its `getKeyboardVisualViewport`: the visual viewport at scale 1, a drop of more than 60 px is
 * the keyboard rather than the browser's bars) for a fixed panel. While a field inside the panel has focus and the
 * keyboard is up, the panel gets `--keyboard-top` and `--keyboard-inset`, so its CSS can fit it to what is visible and
 * its composer rides above the keyboard; once the keyboard is down both are removed (CSS keeps a `0px` fallback).
 */
import { useEffect, type RefObject } from "react";

/** Base UI's `KEYBOARD_RESIZE_THRESHOLD`: a smaller drop is the browser's toolbar, not a keyboard. */
const KEYBOARD_MIN_DROP = 60;
const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

export function useKeyboardInset(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!active || !el || !vv) return;
    const clear = () => {
      el.style.removeProperty("--keyboard-top");
      el.style.removeProperty("--keyboard-inset");
    };
    const align = () => {
      const focused = document.activeElement;
      const typing = focused instanceof HTMLElement && el.contains(focused) && focused.matches(FIELD);
      if (!typing || vv.scale !== 1 || window.innerHeight - vv.height <= KEYBOARD_MIN_DROP) return clear();
      const top = Math.max(0, vv.offsetTop);
      const bottom = Math.min(window.innerHeight, top + vv.height);
      el.style.setProperty("--keyboard-top", `${top}px`);
      el.style.setProperty("--keyboard-inset", `${Math.max(0, window.innerHeight - bottom)}px`);
    };
    vv.addEventListener("resize", align);
    vv.addEventListener("scroll", align);
    // No focusout: a tap on the panel's own Send blurs the field first, and moving the panel then would move the button
    // under the finger. The keyboard closing resizes the visual viewport, which clears the inset.
    el.addEventListener("focusin", align);
    align();
    return () => {
      vv.removeEventListener("resize", align);
      vv.removeEventListener("scroll", align);
      el.removeEventListener("focusin", align);
      clear();
    };
  }, [ref, active]);
}
