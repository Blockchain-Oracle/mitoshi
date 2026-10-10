// From 21st.dev 13063 trophyso/leaderboard-rankings, revamped per D-044 for the leaderboard (S5, RV-86): the row's
// rank · crown (top three) · avatar · name with byline · value layout and the current-user highlight are the source's;
// the role="list" rows become an ordered list of links (a row opens the wallet), the collapsed-run ellipsis and the
// client pagination are dropped (the board serves its top 50 and the asker's own row, shown after an ellipsis), the
// rank-change arrows are dropped (no earlier rank is stored), and colours are Mitoshi's tokens.
import { Crown, EllipsisIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { addressHue } from "@/lib/address-hue";

/** A wallet's page: in-app links route, the explorer opens beside the app. */
function To({ href, className, children, current }: { href: string; className: string; children: ReactNode; current?: boolean }) {
  return href.startsWith("http") ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-current={current ? "true" : undefined} className={className}>{children}</a>
  ) : (
    <Link href={href} aria-current={current ? "true" : undefined} className={className}>{children}</Link>
  );
}

export interface RankingRow {
  rank: number;
  owner: string;
  label: string;
  byline: string;
  figure: string;
  tone: "up" | "down" | "flat";
  href: string;
}

const CROWN: Record<number, string> = { 1: "text-accent", 2: "text-ink", 3: "text-ink-secondary" };
const TONE = { up: "text-up", down: "text-down", flat: "text-ink-secondary" } as const;

function Row({ r, mine, youLabel }: { r: RankingRow; mine: boolean; youLabel: string }) {
  return (
    <li>
      <To
        href={r.href}
        current={mine}
        className={`flex min-h-touch items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${mine ? "bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}
      >
        <span className="flex w-12 shrink-0 items-center gap-1">
          <span className="w-6 text-right type-body-strong tabular-nums text-ink">{r.rank}</span>
          {r.rank <= 3 ? <Crown aria-hidden className={`size-4 ${CROWN[r.rank]}`} /> : null}
        </span>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full type-caption font-semibold text-cream" style={{ background: `oklch(0.47 0.13 ${addressHue(r.owner)}deg)` } as CSSProperties}>
          {r.owner.slice(2, 4).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono type-body text-ink">
            {r.label}
            {mine ? <span className="ml-2 rounded-full bg-accent-fill px-2 py-0.5 font-sans type-label-micro text-on-accent">{youLabel}</span> : null}
          </span>
          <span className="truncate type-caption text-ink-secondary">{r.byline}</span>
        </span>
        <span className={`shrink-0 type-body-strong tabular-nums ${TONE[r.tone]}`}>{r.figure}</span>
      </To>
    </li>
  );
}

export function LeaderboardRankings({ rows, you, youOwner, label, youLabel }: { rows: readonly RankingRow[]; you: RankingRow | null; youOwner: string | null; label: string; youLabel: string }) {
  return (
    <ol aria-label={label} className="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
      {rows.map((r) => (
        <Row key={r.owner} r={r} mine={youOwner === r.owner} youLabel={youLabel} />
      ))}
      {you ? (
        <>
          <li aria-hidden className="flex justify-center py-1 text-ink-secondary">
            <EllipsisIcon className="size-5" />
          </li>
          <Row r={you} mine youLabel={youLabel} />
        </>
      ) : null}
    </ol>
  );
}
