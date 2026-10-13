"use client";
// Owarine 90a91d71 `components/shell/app/ModeChip.tsx` (P6, D-224): on phones, which world you are in, beside the
// mark — DEMO (paper dollars, signed out) or TESTNET (test dollars). Not a picker: the connection decides. R4-8 (D-227):
// a plain chip as Owarine's (the DEMO chip was a 28 px button repeating the Sign in beside it), with the world's hanko;
// at ≤ 360 px the word goes to screen readers and the hanko stays.
import { SHELL } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { modeWords, useShellMode } from "./ModePlate";

export function ModeChip({ className }: { className?: string }) {
  const mode = useShellMode();
  const words = modeWords(mode);
  return (
    <span className={cn("mode-chip", className)} data-mode={mode} title={words.hint}>
      <span aria-hidden className="mode-chip-kanji">{SHELL.mode[mode].kanji}</span>
      <span className="mode-chip-label">{words.label}</span>
    </span>
  );
}
