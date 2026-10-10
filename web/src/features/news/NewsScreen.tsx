// `/news` (S5, L-17) — Masayume 68f7a09 / Agari 4c0278ad `features/news`'s page (Yosuku's own, restored): the heading
// with its Japanese line, the lead stories in the 21st 20087 card, then the wire in Agari's row grammar (index · title ·
// time · source · tickers · tone). Server-rendered from `readWire()` at request time; a ticker opens its terminal.
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { NewsCard } from "@/components/ui/news-card";
import { NEWS, timeAgo } from "./copy";
import { readWire, type Sentiment } from "./wire";

const TONE: Record<Sentiment, string> = { positive: "text-up", negative: "text-down", neutral: "text-ink-secondary" };
const DOT: Record<Sentiment, string> = { positive: "bg-up", negative: "bg-down", neutral: "bg-ink-secondary" };
const LEAD = 4;

export async function NewsScreen() {
  await connection();
  const wire = await readWire();
  const now = wire.readAtMs;
  const at = new Date(now).toISOString().replace("T", " ").slice(0, 16);
  if (wire.articles.length === 0) {
    return <p className="rounded-lg border border-hairline bg-surface-1 p-6 text-center type-body text-ink-secondary">{NEWS.quiet}</p>;
  }
  const lead = wire.articles.slice(0, LEAD);
  return (
    <div className="flex flex-col gap-10">
      <NewsCard title={NEWS.lead} storyLabel={NEWS.story} items={lead.map((a) => ({ time: `${timeAgo(a.publishedAtSec, now)} ago`.replace("now ago", "just now"), headline: a.title, source: a.source, url: a.url }))} className="max-w-xl" />

      <section aria-label={NEWS.list} className="flex flex-col gap-3">
        <h2 className="type-label-micro text-ink-secondary">{NEWS.list}</h2>
        <ol className="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1">
          {wire.articles.map((a, i) => (
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
                    <Link key={s} href={`/trade/${s}`} aria-label={NEWS.trade(s)} className="-my-2.5 inline-flex min-h-touch min-w-touch items-center justify-center font-mono text-ink underline-offset-4 hover:underline">
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
      </section>

      <footer className="flex flex-col gap-1 type-caption text-ink-secondary">
        {wire.partial ? <p>{NEWS.partial}</p> : null}
        <p>{NEWS.credit} {NEWS.tone}</p>
        <p>{NEWS.refreshed(at)}</p>
      </footer>
    </div>
  );
}
