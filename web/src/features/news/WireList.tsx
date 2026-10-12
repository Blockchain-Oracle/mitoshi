// The wire's rows (Agari 4c0278ad's row grammar: index · title · time · source · tickers · tone), shared by /news and the
// stock hub (P5, D-224). No hooks: it renders on the server and in an island alike.
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { tickerHref } from "@/lib/ticker-href";
import { NEWS, timeAgo } from "./copy";
import type { Article, Sentiment } from "./wire";

const TONE: Record<Sentiment, string> = { positive: "text-up", negative: "text-down", neutral: "text-ink-secondary" };
const DOT: Record<Sentiment, string> = { positive: "bg-up", negative: "bg-down", neutral: "bg-ink-secondary" };

export function WireList({ articles, now }: { articles: readonly Article[]; now: number }) {
  return (
    <ol className="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
      {articles.map((a, i) => (
        <li key={a.url} className="flex items-start gap-4 px-4 py-4">
          <span className="w-6 shrink-0 pt-0.5 text-right font-mono type-caption text-ink-secondary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1 type-body-strong text-ink underline-offset-4 hover:underline">
              <span>{a.title}</span>
              <ArrowUpRight aria-hidden className="mt-1 size-3.5 shrink-0 text-ink-secondary" />
            </a>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-ink-secondary">
              <span className="font-mono tabular-nums">{timeAgo(a.publishedAtSec, now)}</span>
              <span>{a.source}</span>
              {a.symbols.map((s) => (
                <Link key={s} href={tickerHref(s)} aria-label={NEWS.trade(s)} className="-my-2.5 inline-flex min-h-touch min-w-touch items-center justify-center font-mono text-ink underline-offset-4 hover:underline">
                  ${s}
                </Link>
              ))}
              <span className={`inline-flex items-center gap-1.5 ${TONE[a.sentiment]}`} title={NEWS.tone}>
                <span aria-hidden className={`inline-block size-1.5 rounded-full ${DOT[a.sentiment]}`} />
                {NEWS.sentiment[a.sentiment]}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
