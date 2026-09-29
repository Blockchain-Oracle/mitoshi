"use client";
// From 21st.dev 26527 olewandowski1/notifications-5 (Dismissible Alert Stack) — one row of it, revamped per D-044: an
// inline, dismissible explainer on Masayume tokens (no success/error colours — the hint is neutral, §2.1 colour law),
// a 44 px dismiss target, shown once per explainer where its question first comes up (D-046 replaces the 5-step
// tutorial with these). Rendered from the server so a first visit never shifts; a dismissed hint leaves after hydration.
import { Info, X } from "lucide-react";
import { SHELL } from "@/lib/copy";
import { EXPLAINERS, type ExplainerId } from "./copy";
import { useFirstUse } from "./useFirstUse";

export function FirstUseHint({ id, className }: { id: ExplainerId; className?: string }) {
  const { show, dismiss } = useFirstUse(id);
  if (!show) return null;
  const { title, body } = EXPLAINERS[id];
  return (
    <aside aria-label={title} className={`flex items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-4${className ? ` ${className}` : ""}`}>
      <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-secondary" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="type-body-strong text-ink">{title}</p>
        <p className="type-caption text-ink-secondary">{body}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label={`${SHELL.close}: ${title}`} className="-mr-2 -mt-2 grid size-touch shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-surface-2">
        <X aria-hidden className="size-4" />
      </button>
    </aside>
  );
}
