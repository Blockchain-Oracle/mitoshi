// `/news` (S5, L-17): the wire — Finnhub's market and company news for the listed stocks, Cointelegraph and Decrypt for
// the coins — read at request time (`features/news`). In the site group: no wallet stack.
import type { Metadata } from "next";
import { Suspense } from "react";
import { NEWS } from "@/features/news/copy";
import { NewsScreen } from "@/features/news/NewsScreen";
import "@/styles/news-card.css";

export const metadata: Metadata = { title: "News", description: "The stories on the coins and stocks Mitoshi lists, newest first, each tagged by its headline's words." };

export default function Page() {
  return (
    <div className="mx-auto flex max-w-(--content-wide) flex-col gap-8 px-gutter py-12 lg:px-gutter-desktop lg:py-16">
      <header className="flex max-w-2xl flex-col gap-3">
        <p className="flex items-center gap-2 type-label-micro text-ink-secondary">
          <span aria-hidden className="inline-block size-2 rounded-full bg-up" />
          {NEWS.eyebrow}
        </p>
        <h1 className="type-display text-ink">
          {NEWS.heading} <span className="text-accent">{NEWS.headingAccent}</span>
        </h1>
        <p lang="ja" className="type-body text-ink-secondary">{NEWS.headingJp}</p>
        <p className="type-body text-ink-secondary">{NEWS.intro}</p>
      </header>
      <Suspense fallback={<p className="type-body text-ink-secondary">{NEWS.quiet.split(".")[0]}…</p>}>
        <NewsScreen />
      </Suspense>
    </div>
  );
}
