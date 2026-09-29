// From 21st.dev 29419 ziegfiroyt/error9 ("404, did you mean") — revamped per D-044: Masayume tokens and type, the
// requested path struck through, a registry-backed suggestion (the nav's closest destination) and one way out. Its
// words are distinct from "moved" (ux-audit §8: not-found used to say "That page moved").
import { CornerDownRight } from "lucide-react";
import Link from "next/link";
import { NOT_FOUND } from "@/lib/copy";

export function NotFound({ requestedPath, suggestion }: { requestedPath?: string | null; suggestion?: { label: string; href: string } | null }) {
  return (
    <section className="w-full px-gutter py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <p className="type-label-micro text-ink-secondary">{NOT_FOUND.eyebrow}</p>
        <h1 className="mt-4 type-headline text-ink">{NOT_FOUND.headline}</h1>
        <p className="mt-4 type-body text-ink-secondary">{NOT_FOUND.body}</p>
        {requestedPath ? <p className="numbers mt-8 truncate type-caption text-ink-secondary line-through">{requestedPath}</p> : null}
        {suggestion ? (
          <div className="mt-3 flex items-start gap-3 rounded-md border border-hairline bg-surface-1 p-4">
            <CornerDownRight aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-secondary" />
            <p className="min-w-0 type-caption">
              <span className="text-ink-secondary">{NOT_FOUND.suggestions} </span>
              <Link href={suggestion.href} className="numbers break-all font-medium text-ink underline underline-offset-4">{suggestion.label}</Link>
            </p>
          </div>
        ) : null}
        <div className="mt-8">
          <Link href="/markets" className="inline-flex min-h-touch items-center rounded-full border border-border-strong px-5 type-body-strong text-ink">{NOT_FOUND.back}</Link>
        </div>
      </div>
    </section>
  );
}
