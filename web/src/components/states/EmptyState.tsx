// Ported from Masayume 68f7a09:web/src/components/states/EmptyState.tsx, laid out from 21st.dev 19745
// cnippet-dev/cnippet-empty (media, title, description, actions; centred, balanced) in Masayume tokens. The contract is
// Masayume's: an empty state says why and names the next action — never a blank panel.
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NextAction = { label: string; href: string } | { label: string; onClick: () => void };

interface EmptyStateProps {
  why: string;
  detail?: string;
  icon?: ReactNode;
  nextAction?: NextAction;
  className?: string;
}

export function EmptyState({ why, detail, icon, nextAction, className }: EmptyStateProps) {
  return (
    <div data-slot="empty" className={cn("flex flex-col items-center gap-3 text-balance rounded-lg border border-hairline bg-surface-1 px-6 py-8 text-center", className)}>
      {icon ? <div aria-hidden className="grid size-10 place-items-center rounded-md border border-hairline bg-surface-2 text-ink-secondary">{icon}</div> : null}
      <p className="type-body-strong text-ink">{why}</p>
      {detail ? <p className="max-w-sm type-caption text-ink-secondary">{detail}</p> : null}
      {nextAction &&
        ("href" in nextAction ? (
          <Button variant="secondary" size="sm" render={<Link href={nextAction.href} />}>
            {nextAction.label}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={nextAction.onClick}>
            {nextAction.label}
          </Button>
        ))}
    </div>
  );
}
