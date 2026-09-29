// Ported from Masayume 68f7a09:web/src/components/shell/CapabilityPending.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { pendingFor } from "@/lib/capabilities";

/**
 * The honest state for a route whose capability is not connected yet. Loading and unavailable are valid product
 * states; inventing odds, balances, fills, opponents or settlements to fill a page is not. This says plainly what the
 * surface will do, what it is waiting on, and where the truth will come from.
 */
export function CapabilityPending({ eyebrow, title, children, dependency }: { eyebrow: string; title: string; children: ReactNode; dependency: string }) {
  return (
    <section className="capability-pending px-gutter lg:px-gutter-desktop">
      <p className="cp-eyebrow">{eyebrow}</p>
      <h1 className="cp-title">{title}</h1>
      <div className="cp-body">{children}</div>
      <p className="cp-meta">Not connected yet · waiting on {dependency}</p>
    </section>
  );
}

/** A registered route's pending page, from `lib/capabilities.ts` (every nav route exists from S1). */
export function PendingRoute({ route }: { route: string }) {
  const p = pendingFor(route);
  return (
    <CapabilityPending eyebrow={p.eyebrow} title={p.title} dependency={p.dependency}>
      <p>{p.body}</p>
      {p.links ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {p.links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-flex min-h-touch items-center rounded-full border border-border-strong px-4 type-caption text-ink">{l.label}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </CapabilityPending>
  );
}
