// Ported from Masayume 68f7a09:web/src/components/states/EmptyState.tsx; R6 (D-230, T16) revamped From 21st.dev 18266
// uiable/empty-background — the muted panel, an icon tile, a title, one `max-w-xs text-pretty` line and the action — on
// Mitoshi's tokens: shadcn's Empty* become our markup (`styles/state-kit.css` `.state`), the muted fill the surface-1
// panel with a surface-2 tile, iconsax lucide, and the buttons kit pills (accent = the next step, ghost = the other
// way). The contract is Masayume's: an empty state says why and names the next action — never a bare line. It sizes to
// its frame (a container query stacks the actions under 18 rem); it never animates (an empty state is a fact).
import type { ReactNode } from "react";
import Link from "next/link";
import { Pill, PillLink } from "@/components/kit/Pill";
import { cn } from "@/lib/utils";

export type NextAction = { label: string; href: string } | { label: string; onClick: () => void };

export interface EmptyStateProps {
  /** The title, ≤ 5 words (the name is kept for compatibility). */
  why: string;
  /** One line of why, ≤ 10 words. */
  detail?: string;
  /** A lucide icon, drawn in the tile. */
  icon?: ReactNode;
  /** The next step: the accent pill. */
  nextAction?: NextAction;
  /** The other way out: a ghost pill. */
  secondaryAction?: NextAction;
  /** `inline` inside a list's own section, `panel` (default) in a frame, `page` for a mostly blank frame. */
  size?: "inline" | "panel" | "page";
  className?: string;
}

export function ActionPill({ action, tone }: { action: NextAction; tone: "accent" | "ink" | "ghost" }) {
  return "href" in action ? (
    <PillLink tone={tone} size="sm" href={action.href}>{action.label}</PillLink>
  ) : (
    <Pill tone={tone} size="sm" onClick={action.onClick}>{action.label}</Pill>
  );
}

interface StateFrameProps {
  title: string;
  line?: string | null;
  icon?: ReactNode;
  size?: "inline" | "panel" | "page" | "strip";
  tone?: "neutral" | "warning";
  titleClass?: string;
  role?: "alert" | "status";
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  slot?: string;
}

/** The one frame empty and error states share: tile, title, one line, actions, then anything below (a disclosure). */
export function StateFrame({ title, line, icon, size = "panel", tone = "neutral", titleClass, role, actions, children, className, slot }: StateFrameProps) {
  const inline = size === "inline" || size === "strip";
  return (
    <div data-slot={slot} data-size={size} data-tone={tone} role={role} className={cn("state", className)}>
      <div className="state-box">
        {icon && size !== "inline" ? <div aria-hidden className="state-tile">{icon}</div> : null}
        <div className="state-copy">
          <p className={cn("state-title", titleClass ?? (inline ? "type-body-strong" : "type-body-strong"))}>{title}</p>
          {line ? <p className="state-line type-caption">{line}</p> : null}
        </div>
        {actions ? <div className="state-actions">{actions}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ why, detail, icon, nextAction, secondaryAction, size = "panel", className }: EmptyStateProps) {
  return (
    <StateFrame
      slot="empty"
      title={why}
      line={detail}
      icon={icon}
      size={size}
      className={className}
      actions={nextAction || secondaryAction ? (
        <>
          {nextAction ? <ActionPill action={nextAction} tone="accent" /> : null}
          {secondaryAction ? <ActionPill action={secondaryAction} tone="ghost" /> : null}
        </>
      ) : null}
    />
  );
}
