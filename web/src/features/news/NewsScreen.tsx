// `/news` (S5, L-17) — Masayume 68f7a09 / Agari 4c0278ad `features/news`'s page (Yosuku's own, restored): the heading
// with its Japanese line, the lead stories in the 21st 20087 card, then the wire in Agari's row grammar (index · title ·
// time · source · tickers · tone). Server-rendered from `readWire()` at request time; a ticker opens its terminal.
import { connection } from "next/server";
import { NewsCard } from "@/components/ui/news-card";
import { NEWS, timeAgo } from "./copy";
import { readWire } from "./wire";
import { WireList } from "./WireList";
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
        <WireList articles={wire.articles} now={now} />
      </section>

      <footer className="flex flex-col gap-1 type-caption text-ink-secondary">
        {wire.partial ? <p>{NEWS.partial}</p> : null}
        <p>{NEWS.credit} {NEWS.tone}</p>
        <p>{NEWS.refreshed(at)}</p>
      </footer>
    </div>
  );
}
