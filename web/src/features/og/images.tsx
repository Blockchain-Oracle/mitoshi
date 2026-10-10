import "server-only";
// Ported from Agari 4c0278ad:web/src/features/landing/og/{site-image,ticker-image,market-image}.tsx and their data
// reads: the site card, a terminal's card (`/trade/<symbol>`) and a Window's card (`/proof/<market>`, the shareable
// Window link since `/markets/<id>` hands off to the terminal, D-192). Each reads the index within the preview budget
// and renders without the data rather than fail.
import { isTickerSymbol, TICKERS, type TickerSymbol } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { indexReader } from "@cwf/db/idx";
import { ImageResponse } from "next/og";
import { readProof, type ProofWindow } from "@/features/proof/data";
import { db } from "@/server/db";
import { OG_COPY } from "./copy";
import { ogFonts } from "./fonts";
import { OgFrame, OgMark } from "./OgFrame";
import { withinBudget } from "./read-budget";
import { OG, OG_SIZE } from "./theme";

const HEADLINE = { display: "flex", fontSize: 92, lineHeight: 0.98, letterSpacing: "-0.035em" } as const;
const QUESTION = { display: "flex", fontSize: 104, lineHeight: 1, letterSpacing: "-0.035em", color: OG.vermilion } as const;
const SITE_MARKS: readonly TickerSymbol[] = ["BTC", "TSLA", "NVDA"];

const usd = (e8: string | bigint) => `$${(Number(e8) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const utc = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} ${d.toISOString().slice(11, 16)}`;
};

/** `/opengraph-image`, `/twitter-image`: the wordmark, the landing's line and three marks. */
export async function siteImage(): Promise<ImageResponse> {
  const S = OG_COPY.site;
  return new ImageResponse(
    <OgFrame eyebrow={S.eyebrow}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ ...HEADLINE, color: OG.ink }}>{S.lead}</div>
          <div style={{ ...HEADLINE, color: OG.vermilion }}>{S.accent}</div>
          <div style={{ display: "flex", marginTop: 32, fontSize: 32, color: OG.soft }}>{S.line}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {SITE_MARKS.map((symbol) => (
            <OgMark key={symbol} symbol={symbol} size={96} />
          ))}
        </div>
      </div>
    </OgFrame>,
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}

/** The ticker's most recent recorded print, from the index. */
async function lastPrint(symbol: TickerSymbol): Promise<{ priceE8: string; atSec: number } | null> {
  const last = await indexReader(db()).latestPrint(symbol);
  return last ? { priceE8: String(last.price_e8), atSec: Number(last.source_ts_sec) } : null;
}

/** `/trade/<symbol>/opengraph-image`: the mark, the asset's name, "Up or Down?" and its last signed print. */
export async function tickerImage(raw: string): Promise<ImageResponse> {
  const T = OG_COPY.ticker;
  const symbol = isTickerSymbol(raw) ? raw : null;
  const [fonts, print] = await Promise.all([ogFonts(), symbol ? withinBudget(lastPrint(symbol)) : Promise.resolve(null)]);
  return new ImageResponse(
    <OgFrame eyebrow={T.eyebrow}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 56 }}>
        {symbol ? <OgMark symbol={symbol} size={184} /> : null}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {symbol ? <div style={{ display: "flex", fontSize: 64, letterSpacing: "-0.03em", color: OG.ink }}>{`${TICKERS[symbol].name} (${symbol})`}</div> : null}
          <div style={{ ...QUESTION, marginTop: 16 }}>{T.question}</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 32, color: OG.soft }}>{print ? `${usd(print.priceE8)} · ${T.lastPrint(utc(print.atSec))}` : T.noPrint}</div>
        </div>
      </div>
    </OgFrame>,
    { ...OG_SIZE, fonts },
  );
}

function verdict(w: ProofWindow): { text: string; color: string } {
  const V = OG_COPY.window;
  if (w.state === "voided") return { text: V.void, color: OG.soft };
  if (w.state !== "resolved") return { text: V.open, color: OG.soft };
  return w.winner === 0 ? { text: V.up, color: OG.up } : { text: V.down, color: OG.down };
}

/** `/proof/<market>/opengraph-image`: the Window, its verdict and the closing print that decided it. */
export async function windowImage(market: string): Promise<ImageResponse> {
  const V = OG_COPY.window;
  const valid = /^0x[0-9a-fA-F]{64}$/.test(market);
  const [fonts, read] = await Promise.all([ogFonts(), valid ? withinBudget(readProof(market.toLowerCase() as `0x${string}`)) : Promise.resolve(null)]);
  const w = read && read !== "unknown" ? read : null;
  const symbol = w && isTickerSymbol(w.symbol) ? w.symbol : null;
  const close = w?.prints.find((p) => p.which === 1) ?? null;
  const v = w ? verdict(w) : null;
  return new ImageResponse(
    <OgFrame eyebrow={V.eyebrow}>
      {w && symbol && v ? (
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 56 }}>
          <OgMark symbol={symbol} size={184} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 56, letterSpacing: "-0.03em", color: OG.ink }}>{`${symbol} ${w.basis === 2 ? "24/7 " : ""}${formatCadence(w.cadenceSec)} Window`}</div>
            <div style={{ display: "flex", marginTop: 16, fontSize: 96, lineHeight: 1, letterSpacing: "-0.035em", color: v.color }}>{v.text}</div>
            <div style={{ display: "flex", marginTop: 20, fontSize: 30, color: OG.soft }}>{close ? V.closed(usd(close.priceE8), utc(close.sourceTsSec), close.signers) : utc(w.expirySec)}</div>
            <div style={{ display: "flex", marginTop: 10, fontSize: 30, color: OG.ink }}>{V.reverify}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
          <div style={QUESTION}>{OG_COPY.ticker.question}</div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: OG.soft }}>{read === "unknown" || !valid ? V.unknown : V.unread}</div>
        </div>
      )}
    </OgFrame>,
    { ...OG_SIZE, fonts },
  );
}
