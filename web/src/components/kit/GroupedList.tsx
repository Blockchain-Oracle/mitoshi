"use client";
// Ported from Owarine 90a91d71:web/src/features/terminal/ui/sheets/AccountSheet.tsx (its groups, rows and Toggle) and
// lifted out of the terminal's AccountDrawer (R4-2, D-227): the settings grammar — a titled group of 48 px rows, each an
// icon, a label, an optional detail and a chevron, as a link or a button; a toggle row is the whole row as the switch
// (a label, a line under it, the track). The account drawer and /settings build from it.
import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { tapFeedback } from "@/lib/feedback";

export function GroupedList({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="kit-group" role="group" aria-labelledby={id}>
      <span id={id} className="kit-group-title">{title}</span>
      <div className="kit-group-body">{children}</div>
    </div>
  );
}

export function GroupedItem({ icon: Icon, label, detail, onClick, href }: { icon: LucideIcon; label: string; detail?: string; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <Icon aria-hidden className="kit-item-icon" />
      <span className="kit-item-label">{label}</span>
      {detail ? <span className="kit-item-detail">{detail}</span> : null}
      <ChevronRight aria-hidden className="kit-item-chevron" />
    </>
  );
  return href ? (
    <Link href={href} className="kit-item" onClick={tapFeedback}>{body}</Link>
  ) : (
    <button type="button" className="kit-item" onClick={() => (tapFeedback(), onClick?.())}>{body}</button>
  );
}

/** A toggle row (Owarine's Toggle): the whole row is the switch, so the label is the 48 px target. */
export function GroupedToggle({ label, sub, checked, onChange, disabled }: { label: string; sub?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="kit-item kit-item--toggle" onClick={() => (tapFeedback(), onChange(!checked))}>
      <span className="kit-item-label">
        <span className="block">{label}</span>
        {sub ? <span className="kit-item-detail block">{sub}</span> : null}
      </span>
      <span aria-hidden className="kit-toggle" data-on={checked ? "" : undefined}>
        <span className="kit-toggle-knob" />
      </span>
    </button>
  );
}
