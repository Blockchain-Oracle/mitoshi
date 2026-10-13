"use client";
// From 21st.dev 28469 ncdai/copy-button — revamped per D-044 (R4-12, D-227): one icon button that copies a value and
// swaps its icon to a tick (or a cross when the clipboard refuses) for 1.5 s; lucide icons, no sound or haptics, a
// 44 px hit area (`min-h-touch`), the result announced to screen readers. Used beside `Hash` for guids and hashes.
import { Check, Copy, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "done" | "error";

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 1500);
  };
  const Icon = state === "done" ? Check : state === "error" ? X : Copy;
  return (
    <button type="button" onClick={() => void copy()} aria-label={label} className={cn("inline-flex min-h-touch min-w-touch items-center justify-center text-ink-secondary hover:text-ink", className)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only" aria-live="polite">{state === "done" ? "Copied" : state === "error" ? "Copy failed" : ""}</span>
    </button>
  );
}
