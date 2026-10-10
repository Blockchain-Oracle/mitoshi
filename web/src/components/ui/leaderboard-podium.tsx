// From 21st.dev 13057 trophyso/leaderboard-podium, revamped per D-044 for the leaderboard (S5, RV-86): the 2 · 1 · 3
// order, the crown over each place, the avatar ring and the stepped plinths are the source's; cva variants, the
// `rank-*` palette and image avatars are gone — a wallet is its initials on its address hue (as the account drawer's
// avatar), first place takes the accent and the others the ink tiers, and each place is a link with its figure.
import { Crown } from "lucide-react";
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

export interface PodiumPlace {
  rank: number;
  owner: string;
  label: string;
  figure: string;
  /** The figure's tone: profit, loss or plain. */
  tone: "up" | "down" | "flat";
  href: string;
}

const PLINTH: Record<number, string> = { 1: "h-28 bg-accent/25 border-accent/40", 2: "h-20 bg-surface-2 border-hairline", 3: "h-14 bg-surface-2 border-hairline" };
const CROWN: Record<number, string> = { 1: "text-accent", 2: "text-ink", 3: "text-ink-secondary" };
const TONE = { up: "text-up", down: "text-down", flat: "text-ink-secondary" } as const;

export function LeaderboardPodium({ places, label }: { places: readonly PodiumPlace[]; label: string }) {
  const order = [2, 1, 3].map((r) => places.find((p) => p.rank === r)).filter((p): p is PodiumPlace => Boolean(p));
  if (order.length === 0) return null;
  return (
    <ol aria-label={label} className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((p) => (
        <li key={p.owner} className={`flex min-w-0 flex-col items-center gap-2 ${p.rank === 1 ? "order-2" : p.rank === 2 ? "order-1" : "order-3"}`}>
          <To href={p.href} className="group flex min-w-0 max-w-full flex-col items-center gap-2 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-accent">
            <Crown aria-hidden className={`size-5 ${CROWN[p.rank]}`} />
            <span
              aria-hidden
              className={`grid size-12 place-items-center rounded-full font-semibold text-cream ring-2 sm:size-14 ${p.rank === 1 ? "ring-accent" : "ring-hairline"}`}
              style={{ background: `oklch(0.47 0.13 ${addressHue(p.owner)}deg)` } as CSSProperties}
            >
              {p.owner.slice(2, 4).toUpperCase()}
            </span>
            <span className="max-w-full truncate font-mono type-caption text-ink group-hover:underline">{p.label}</span>
            <span className={`type-body-strong tabular-nums ${TONE[p.tone]}`}>{p.figure}</span>
          </To>
          <span aria-hidden className={`flex w-full items-start justify-center rounded-t-md border pt-2 type-title tabular-nums text-ink ${PLINTH[p.rank]}`}>{p.rank}</span>
        </li>
      ))}
    </ol>
  );
}
