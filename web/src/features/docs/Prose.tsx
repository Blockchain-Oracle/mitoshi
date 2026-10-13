// The docs' typography: a handful of server components over Mitoshi's type tokens, so a page reads as plain structure.
import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "@/components/shell/ExternalLink";

/** On a phone the Contents pill sits on the title's row (R4-10), so the title leaves it room. */
export const H1 = ({ children }: { children: ReactNode }) => <h1 className="type-display text-ink max-lg:pr-32">{children}</h1>;
export const Lead = ({ children }: { children: ReactNode }) => <p className="type-body text-ink-secondary">{children}</p>;
export const H2 = ({ children, id }: { children: ReactNode; id?: string }) => <h2 id={id} className="mt-4 type-title text-ink">{children}</h2>;
export const P = ({ children }: { children: ReactNode }) => <p className="type-body text-ink">{children}</p>;
export const Ul = ({ items }: { items: readonly ReactNode[] }) => (
  <ul className="flex list-disc flex-col gap-2 pl-5 type-body text-ink">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
);
export const Ol = ({ items }: { items: readonly ReactNode[] }) => (
  <ol className="flex list-decimal flex-col gap-2 pl-5 type-body text-ink">{items.map((item, i) => <li key={i}>{item}</li>)}</ol>
);
/** A note the reader must not miss: testnet money, a limit, what is next. */
export const Note = ({ children }: { children: ReactNode }) => (
  <aside className="rounded-lg border border-hairline bg-surface-1 p-4 type-body text-ink-secondary">{children}</aside>
);
export const A = ({ href, children }: { href: string; children: ReactNode }) =>
  href.startsWith("http") ? (
    // Through the shell's bridge, so the native app opens it in its browser rather than leaving the page (fix 5).
    <ExternalLink href={href} className="text-ink underline underline-offset-4">{children}</ExternalLink>
  ) : (
    <Link href={href} className="text-ink underline underline-offset-4">{children}</Link>
  );
export const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em] text-ink">{children}</code>;
export function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly ReactNode[])[] }) {
  return (
    // Focusable so a keyboard can scroll a table wider than a phone (axe: scrollable-region-focusable).
    <div tabIndex={0} className="overflow-x-auto rounded-lg border border-hairline focus-visible:outline-2 focus-visible:outline-accent">
      <table className="w-full border-collapse type-body">
        {head.some(Boolean) ? (
          <thead className="bg-surface-1 text-left text-ink-secondary">
            <tr>{head.map((h, i) => <th key={i} className="px-4 py-3 type-label-micro">{h}</th>)}</tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-hairline">{r.map((c, j) => <td key={j} className="px-4 py-3 align-top text-ink">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
