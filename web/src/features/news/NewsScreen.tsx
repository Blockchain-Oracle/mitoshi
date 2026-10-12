// `/news` — Owarine 90a91d71 `features/news/{NewsScreen,NewsHead,NewsFeed}.tsx` (D-226) on Mitoshi's wire, read at
// request time (`readWire()`: Finnhub for the stocks, Cointelegraph and Decrypt for the coins): the live mark, the head
// (narrowed by `?symbol=`), one lead story at display size with its tone edge, marks and cashtags, a rule, then the
// numbered wire rows. The 21st carousel is gone; the credit stays, one line.
import { isTickerSymbol, type TickerSymbol } from "@cwf/core";
import { connection } from "next/server";
import { NEWS, timeAgo } from "./copy";
import { articleSymbols, Cashtags, MarkCluster, NewsRow, Tone } from "./NewsRow";
import { readWire, type Article } from "./wire";

function Meta({ article, now }: { article: Article; now: number }) {
  return (
    <span className="news-meta">
      {timeAgo(article.publishedAtSec, now)} · {article.source}
    </span>
  );
}

export function NewsHead({ symbol }: { symbol: TickerSymbol | null }) {
  return (
    <>
      <h1 className="news-title">
        {symbol ?? NEWS.heading} <span className="signal">{NEWS.headingAccent}</span>
      </h1>
      <div className="page-title-jp" lang="ja">{NEWS.headingJp}</div>
    </>
  );
}

/** A display-size lead and five wire lines while the wire is read. */
export function NewsSkeleton() {
  const widths = ["85%", "76%", "67%", "58%", "49%"];
  return (
    <div className="news-feed news-skeleton" role="status" aria-busy="true" aria-label={NEWS.reading}>
      <div className="news-skeleton-lead">
        <div className="news-bone eyebrow" />
        <div className="news-bone headline" />
        <div className="news-bone headline short" />
      </div>
      <div className="news-skeleton-wire">
        {widths.map((width) => (
          <div key={width} className="news-bone line" style={{ width }} />
        ))}
      </div>
    </div>
  );
}

export async function NewsFeed({ symbol }: { symbol: string | null }) {
  await connection();
  const wire = await readWire();
  const now = wire.readAtMs;
  const pinned = symbol && isTickerSymbol(symbol) ? symbol : null;
  const articles = pinned ? wire.articles.filter((a) => a.symbols.includes(pinned)) : wire.articles;
  if (articles.length === 0) return <p className="news-quiet">{NEWS.quiet}</p>;
  const [lead, ...rest] = articles as [Article, ...Article[]];
  const leadSymbols = articleSymbols(lead.symbols);
  return (
    <div className="news-feed">
      <div className="news-lead" data-tone={lead.sentiment}>
        <div className="news-lead-meta">
          <span className="news-index accent">01</span>
          <Tone tone={lead.sentiment} word={NEWS.sentiment[lead.sentiment]} />
          <Meta article={lead} now={now} />
        </div>
        <a href={lead.url} target="_blank" rel="noopener noreferrer" className="news-lead-link">
          <h2 className="news-lead-title">
            {lead.title}
            <span className="news-lead-arrow" aria-hidden>↗</span>
          </h2>
        </a>
        {leadSymbols.length > 0 ? (
          <div className="news-lead-foot">
            <MarkCluster symbols={leadSymbols} className="news-lead-marks" />
            <Cashtags symbols={leadSymbols} />
          </div>
        ) : null}
      </div>

      <div className="news-rule" aria-hidden>
        <div className="news-rule-end" />
        <div className="news-rule-line" />
      </div>

      <ol className="news-wire">
        {rest.map((article, i) => {
          const symbols = articleSymbols(article.symbols);
          return (
            <NewsRow
              key={article.url}
              index={i + 2}
              title={article.title}
              href={article.url}
              mark={<MarkCluster symbols={symbols} />}
              meta={
                <>
                  <Meta article={article} now={now} />
                  <Cashtags symbols={symbols} />
                </>
              }
              tone={article.sentiment}
              toneWord={NEWS.sentiment[article.sentiment]}
            />
          );
        })}
      </ol>
      <p className="news-credit">{wire.partial ? `${NEWS.partial} ` : ""}{NEWS.credit}</p>
    </div>
  );
}
